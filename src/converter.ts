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
    f === "plain"
      ? `${s}\n`
      : wrap("div", s || (f === "bb" ? "&#160;" : "<br>"), f) + "\n";
  const children = (n: Node, f: Format) =>
    n.children.map((c) => render(c, f)).join("");
  const paragraph = (ns: Node[], f: Format, bold = false) =>
    rows(ns)
      .map((line) => {
        let s = line.map((n) => render(n, f)).join("");
        if (bold) s = wrap("b", s, f);
        return div(s, f);
      })
      .join("");
  const literalBlock = (text: string, f: Format, code: boolean) => {
    const expanded = code ? expandTabs(text, tabSize) : text;
    return expanded
      .split("\n")
      .map((line) => {
        let s = encode(line, f);
        if (f !== "plain") s = s.replace(/ /g, "&#160;");
        return div(s, f);
      })
      .join("");
  };
  function render(n: Node, f: Format): string {
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
        if (f === "plain") return children(n, f);
        return wrap("ul", "\n" + children(n, f), f) + "\n";
      case "ordered_list": {
        if (n.start !== 1) {
          warnings.add("非 1 起始的有序清單改用文字編號，以保留原始編號。");
          return n.children
            .map((item, i) => {
              const first = item.children[0];
              const label: Node = {
                kind: "text",
                text: `${(n.start ?? 1) + i}. `,
                children: [],
              };
              if (first?.kind === "paragraph")
                return (
                  paragraph([label, ...first.children], f) +
                  item.children
                    .slice(1)
                    .map((c) => render(c, f))
                    .join("")
                );
              return div(encode(label.text!, f), f) + children(item, f);
            })
            .join("");
        }
        if (f === "plain")
          return n.children
            .map((item, i) => `${i + 1}. ` + children(item, f))
            .join("");
        return wrap("ol", "\n" + children(n, f), f) + "\n";
      }
      case "list_item": {
        const clone = {
          ...n,
          children: n.children.map((c) => ({
            ...c,
            children: [...c.children],
          })),
        };
        const first = clone.children[0]?.children[0];
        if (first?.kind === "text" && /^\[[ xX]\] /.test(first.text ?? "")) {
          clone.children[0].children[0] = {
            ...first,
            text: first.text!.replace(/^\[([ xX])\] /, (_, checked: string) =>
              checked === " " ? "☐ " : "☑ ",
            ),
          };
        }
        return f === "plain"
          ? "• " + children(clone, f)
          : wrap("li", children(clone, f), f) + "\n";
      }
      case "blockquote":
        return div(encode("引用：", f), f) + children(n, f);
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
  const output = (f: Format) =>
    nodes
      .map((n) => render(n, f))
      .join("")
      .replace(/\n$/, "");
  // Bahamut inserts <br> for source newlines between block tags.
  // Block tags already represent every intentional line, including code blanks.
  const bbcode = output("bb").replace(/\n(?=\[)/g, "");
  const html = output("html");
  const plainText = output("plain");
  return { bbcode, html, plainText, warnings: [...warnings] };
}
