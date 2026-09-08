import MarkdownIt from "markdown-it";
type Token = ReturnType<typeof md.parse>[number];

export interface ConvertOptions {
  tabSize?: number;
}
export interface ConversionResult {
  bbcode: string;
  html: string;
  plainText: string;
  warnings: string[];
}
interface Node {
  kind: string;
  text?: string;
  url?: string;
  start?: number;
  children: Node[];
  tight?: boolean;
}
type Format = "bb" | "html" | "plain";
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: false,
});
// Parse destinations first; the renderer applies a stricter HTTP(S)-only policy.
md.validateLink = () => true;
md.inline.ruler.before("escape", "literal_math", (state, silent) => {
  const rest = state.src.slice(state.pos);
  const delimiter = rest.startsWith("$$")
    ? "$$"
    : rest.startsWith("$")
      ? "$"
      : rest.startsWith("\\(")
        ? "\\("
        : "";
  if (!delimiter) return false;
  const endMarker = delimiter === "\\(" ? "\\)" : delimiter;
  const end = state.src.indexOf(endMarker, state.pos + delimiter.length);
  if (end < 0 || end === state.pos + delimiter.length) return false;
  if (!silent)
    state.push("math_literal", "", 0).content = state.src.slice(
      state.pos,
      end + endMarker.length,
    );
  state.pos = end + endMarker.length;
  return true;
});
md.block.ruler.before(
  "fence",
  "literal_math_block",
  (state, startLine, endLine, silent) => {
    const line = state.src
      .slice(
        state.bMarks[startLine] + state.tShift[startLine],
        state.eMarks[startLine],
      )
      .trim();
    if (line !== "$$" && line !== "\\[") return false;
    const closing = line === "$$" ? "$$" : "\\]";
    let end = startLine + 1;
    while (
      end < endLine &&
      state.src
        .slice(state.bMarks[end] + state.tShift[end], state.eMarks[end])
        .trim() !== closing
    )
      end++;
    if (end === endLine) return false;
    if (silent) return true;
    const token = state.push("math_block", "", 0);
    token.content = state
      .getLines(startLine, end + 1, state.blkIndent, false)
      .replace(/\n$/, "");
    token.map = [startLine, end + 1];
    state.line = end + 1;
    return true;
  },
);

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const escapeBB = (s: string) =>
  escapeHtml(s).replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
const encode = (s: string, f: Format) =>
  f === "html" ? escapeHtml(s) : f === "bb" ? escapeBB(s) : s;
function safeUrl(raw: string): string | undefined {
  if (!/^https?:\/\//i.test(raw) || /[\u0000-\u0020\u007f]/.test(raw)) return;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return;
    // Quotes and square brackets cannot escape a BBCode attribute.
    return url.href.replace(
      /[\[\]"'<>]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  } catch {
    return;
  }
}
function tree(tokens: Token[]): Node[] {
  const root: Node = { kind: "root", children: [] };
  const stack = [root];
  for (const token of tokens) {
    if (token.nesting === -1) {
      stack.pop();
      continue;
    }
    if (token.type === "inline") {
      stack.at(-1)!.children.push(...tree(token.children ?? []));
      continue;
    }
    const node: Node = {
      kind: token.type.replace(/_open$/, ""),
      text: token.content,
      tight: token.hidden,
      url: String(token.attrGet(token.type === "image" ? "src" : "href") ?? ""),
      start:
        token.type === "ordered_list_open"
          ? Number(token.attrGet("start") ?? 1)
          : undefined,
      children: token.children ? tree(token.children) : [],
    };
    stack.at(-1)!.children.push(node);
    if (token.nesting === 1) stack.push(node);
  }
  return root.children;
}
// Split soft/hard breaks while reopening inline formatting on each visual line.
function rows(nodes: Node[]): Node[][] {
  const output: Node[][] = [[]];
  for (const node of nodes) {
    if (node.kind === "softbreak" || node.kind === "hardbreak") {
      output.push([]);
      continue;
    }
    if (node.children.length && node.kind !== "image") {
      const nested = rows(node.children);
      nested.forEach((children, i) => {
        if (i) output.push([]);
        output.at(-1)!.push({ ...node, children });
      });
    } else output.at(-1)!.push(node);
  }
  return output;
}
export function expandTabs(text: string, size = 4): string {
  return text
    .split("\n")
    .map((line) => {
      let column = 0;
      return Array.from(line)
        .map((c) => {
          if (c !== "\t") {
            column++;
            return c;
          }
          const count = size - (column % size);
          column += count;
          return " ".repeat(count);
        })
        .join("");
    })
    .join("\n");
}
export function convertMarkdown(
  input: string,
  options: ConvertOptions = {},
): ConversionResult {
  const warnings = new Set<string>();
  const tabSize =
    Number.isInteger(options.tabSize) &&
    options.tabSize! >= 1 &&
    options.tabSize! <= 16
      ? options.tabSize!
      : 4;
  const nodes = tree(md.parse(input.replace(/\r\n?/g, "\n"), {}));
  const wrap = (tag: string, content: string, f: Format, attr = "") =>
    f === "plain"
      ? content
      : f === "bb"
        ? `[${tag}${attr}]${content}[/${tag}]`
        : `<${tag}${attr}>${content}</${tag}>`;
  const div = (s: string, f: Format) =>
    f === "plain" ? `${s}\n` : wrap("div", s || "&#160;", f) + "\n";
  // Decide spacing from block structure, never from serialized line breaks.
  const sequence = (ns: Node[], f: Format, indent = 0): string =>
    ns
      .map((n, i) => {
        const previous = ns[i - 1];
        const gap =
          previous &&
          previous.kind !== "hr" &&
          (n.kind === "heading" ||
            (n.kind === "paragraph" &&
              previous.kind === "paragraph" &&
              !n.tight &&
              !previous.tight));
        return (gap ? div("", f) : "") + render(n, f, indent);
      })
      .join("");
  const children = (n: Node, f: Format) => sequence(n.children, f);
  const spaces = (count: number, f: Format) =>
    (f === "plain" ? " " : "&#160;").repeat(count);
  const paragraph = (
    ns: Node[],
    f: Format,
    bold = false,
    first = "",
    rest = "",
  ) =>
    rows(ns)
      .map((line, i) => {
        let s = line.map((n) => render(n, f)).join("");
        if (bold) s = wrap("b", s, f);
        return div((i === 0 ? first : rest) + s, f);
      })
      .join("");
  const taskItem = (item: Node): Node => {
    const first = item.children[0];
    const text = first?.children[0];
    if (
      first?.kind !== "paragraph" ||
      text?.kind !== "text" ||
      !/^\[[ xX]\] /.test(text.text ?? "")
    )
      return item;
    return {
      ...item,
      children: [
        {
          ...first,
          children: [
            {
              ...text,
              text: text.text!.replace(/^\[([ xX])\] /, (_, check: string) =>
                check === " " ? "☐ " : "☑ ",
              ),
            },
            ...first.children.slice(1),
          ],
        },
        ...item.children.slice(1),
      ],
    };
  };
  const numberedItem = (
    raw: Node,
    label: string,
    f: Format,
    indent: number,
  ) => {
    const item = taskItem(raw);
    const continuation = spaces(indent + label.length, f);
    return item.children
      .map((child, i) => {
        const previous = item.children[i - 1];
        const gap =
          previous &&
          previous.kind !== "hr" &&
          (child.kind === "heading" ||
            (previous.kind === "paragraph" &&
              child.kind === "paragraph" &&
              !previous.tight &&
              !child.tight));
        if (child.kind === "paragraph" || child.kind === "heading")
          return (
            (gap ? div("", f) : "") +
            paragraph(
              child.children,
              f,
              child.kind === "heading",
              i === 0 ? spaces(indent, f) + encode(label, f) : continuation,
              continuation,
            )
          );
        return (
          (i === 0 ? div(spaces(indent, f) + encode(label, f), f) : "") +
          render(
            child,
            f,
            indent +
              ((f === "plain" && child.kind === "bullet_list") ||
              (f === "plain" &&
                child.kind === "ordered_list" &&
                child.start === 1)
                ? 4
                : 0),
          )
        );
      })
      .join("");
  };
  const literalBlock = (text: string, f: Format, code: boolean) => {
    const expanded = code ? expandTabs(text, tabSize) : text;
    return expanded
      .split("\n")
      .map((line) => {
        let s = encode(line, f);
        if (f !== "plain") s = s.replace(/ /g, "&#160;");
        if (code && line.trim() && f !== "plain") {
          s =
            f === "bb"
              ? `[font=Courier New]${s}[/font]`
              : `<span style="font-family:Courier New,monospace">${s}</span>`;
        }
        return div(s, f);
      })
      .join("");
  };
  function render(n: Node, f: Format, indent = 0): string {
    if (
      n.text &&
      /&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[\da-fA-F]+);/.test(n.text)
    ) {
      warnings.add(
        "實體字面值在本機預覽與純文字中保留；巴哈原始碼發文可能再次解碼，已測兩層、三層編碼仍未解決。請另行保留原文。",
      );
    }
    switch (n.kind) {
      case "text":
        return encode(n.text ?? "", f);
      case "paragraph":
        return paragraph(n.children, f);
      case "heading":
        return paragraph(n.children, f, true);
      case "strong":
        return wrap("b", children(n, f), f);
      case "em":
        return wrap("i", children(n, f), f);
      case "s":
        return wrap("s", children(n, f), f);
      case "code_inline":
        return encode(n.text ?? "", f);
      case "fence":
      case "code_block":
        warnings.add(
          "程式碼採逐行區塊，不使用 [code]；Tab 與空格已轉成視覺縮排，複製後不保證逐位元相同。",
        );
        return literalBlock((n.text ?? "").replace(/\n$/, ""), f, true);
      case "math_literal":
        warnings.add("公式保留原文，未渲染 LaTeX。");
        return encode(n.text ?? "", f);
      case "math_block":
        warnings.add("公式保留原文，未渲染 LaTeX。");
        return literalBlock(n.text ?? "", f, false);
      case "html_inline":
      case "html_block":
        warnings.add("原始 HTML 已當作文字處理，不會執行。");
        return n.kind === "html_block"
          ? literalBlock((n.text ?? "").replace(/\n$/, ""), f, false)
          : encode(n.text ?? "", f);
      case "softbreak":
      case "hardbreak":
        return f === "plain" ? "\n" : f === "html" ? "<br>" : "\n";
      case "hr":
        return f === "bb" ? "[hr]\n" : f === "html" ? "<hr>\n" : "────────\n";
      case "bullet_list":
      case "ordered_list": {
        const ordered = n.kind === "ordered_list";
        const fallback = ordered && n.start !== 1;
        if (fallback)
          warnings.add(
            "非 1 起始清單採文字編號，保留原始編號與手動縮排；比例字體及自動折行無法保證懸掛對齊。",
          );
        if (fallback || f === "plain") {
          const offset = fallback ? indent + 4 : indent;
          return n.children
            .map((item, i) => {
              const label = ordered ? `${(n.start ?? 1) + i}. ` : "• ";
              const content = numberedItem(item, label, f, offset);
              // Keep descendants inside the owning fallback item.
              return f === "plain" ? content : wrap("div", content, f) + "\n";
            })
            .join("");
        }
        // Native list containers supply their own indentation.
        return wrap(ordered ? "ol" : "ul", "\n" + children(n, f), f) + "\n";
      }
      case "list_item":
        return wrap("li", children(taskItem(n), f), f) + "\n";
      case "blockquote": {
        const content = children(n, f);
        if (f === "plain")
          return (
            content
              .replace(/\n$/, "")
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n") + "\n"
          );
        return (
          wrap(
            f === "bb" ? "quote" : "blockquote",
            content,
            f,
            f === "html"
              ? ' style="border-left:3px solid #8a9ba8;margin:12px 0;padding-left:16px"'
              : "",
          ) + "\n"
        );
      }
      case "table":
        if (f === "plain") return children(n, f);
        return (
          wrap(
            "table",
            "\n" + children(n, f),
            f,
            f === "bb"
              ? " width=100% border=1 cellspacing=0 cellpadding=4"
              : f === "html"
                ? ' border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%"'
                : "",
          ) + "\n"
        );
      case "thead":
      case "tbody":
        return children(n, f);
      case "tr":
        return f === "plain"
          ? n.children.map((c) => children(c, f)).join(" | ") + "\n"
          : wrap("tr", "\n" + children(n, f), f) + "\n";
      case "th":
      case "td":
        return (
          wrap("td", paragraph(n.children, f, n.kind === "th"), f) +
          (f === "plain" ? "" : "\n")
        );
      case "link": {
        const url = safeUrl(n.url ?? "");
        const label = children(n, f);
        if (!url) {
          warnings.add(
            "非 HTTP(S)、含帳密或無效的連結已移除連結功能，保留文字。",
          );
          return label;
        }
        if (f === "plain") return `${label}（${url}）`;
        return f === "bb"
          ? `[url=${escapeBB(url)}]${label}[/url]`
          : `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${label}</a>`;
      }
      case "image": {
        const alt = n.children.length ? children(n, "plain") : n.text || "圖片";
        const url = safeUrl(n.url ?? "");
        warnings.add(
          "外部圖片以網址引用；巴哈可能另行處理或要求上傳，網站預覽不代表貼上結果。",
        );
        if (!url) {
          warnings.add("無效或非 HTTP(S) 圖片網址已轉為說明文字。");
          return encode(`圖片：${alt}`, f);
        }
        if (f === "plain") return `圖片：${alt}（${url}）`;
        return f === "bb"
          ? `[img=${escapeBB(url)}]`
          : `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" referrerpolicy="no-referrer" style="max-width:100%;height:auto">`;
      }
      default:
        warnings.add("部分語法無法完整呈現，已保留可讀文字。");
        return children(n, f) || encode(n.text ?? "", f);
    }
  }
  const output = (f: Format) => sequence(nodes, f).replace(/\n$/, "");
  // Bahamut inserts <br> for source newlines between block tags.
  // Block tags already represent every intentional line, including code blanks.
  const bbcode = output("bb").replace(/\n(?=\[)/g, "");
  const html = output("html");
  const plainText = output("plain");
  return { bbcode, html, plainText, warnings: [...warnings] };
}
