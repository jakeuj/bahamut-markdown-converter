import { describe, expect, it } from "vitest";
import { convertMarkdown, expandTabs } from "../src/converter";
import { sample } from "../src/sample";

describe("paragraphs and inline structure", () => {
  it("handles empty input", () =>
    expect(convertMarkdown("")).toEqual({
      bbcode: "",
      html: "",
      plainText: "",
      warnings: [],
    }));
  it("wraps headings and paragraphs", () => {
    expect(convertMarkdown("# 主題\n\n內容 **粗體**").bbcode).toBe(
      "[div][b]主題[/b][/div][div]內容 [b]粗體[/b][/div]",
    );
  });
  it("reopens formatting across line breaks", () => {
    expect(convertMarkdown("**第一行\n第二行**").bbcode).toBe(
      "[div][b]第一行[/b][/div][div][b]第二行[/b][/div]",
    );
  });
  it("preserves nested emphasis and strike", () => {
    expect(convertMarkdown("***文字*** ~~刪除~~").bbcode).toContain(
      "[i][b]文字[/b][/i] [s]刪除[/s]",
    );
  });
  it("normalizes line endings", () =>
    expect(convertMarkdown("甲\r\n乙\r丙").bbcode).toBe(
      "[div]甲[/div][div]乙[/div][div]丙[/div]",
    ));
  it("preserves brackets, entities and inline code as text", () => {
    const r = convertMarkdown("`[b]<x>&amp;[/b]`");
    expect(r.bbcode).toBe(
      "[div]&#91;b&#93;&lt;x&gt;&amp;amp;&#91;/b&#93;[/div]",
    );
    expect(r.plainText).toBe("[b]<x>&amp;[/b]");
  });
  it("does not emit a closing hr tag", () =>
    expect(convertMarkdown("---").bbcode).toBe("[hr]"));
});
describe("lists, quotes and tables", () => {
  it("preserves nested lists", () => {
    const r = convertMarkdown("- 父\n  1. 子\n     - 孫");
    expect(r.bbcode).toContain(
      "[ul][li][div]父[/div][ol][li][div]子[/div][ul]",
    );
    expect(r.html).toContain("<ol>");
  });
  it("converts tasks only at the start of list items", () => {
    const r = convertMarkdown("- [x] 完成\n- [ ] 未完成\n\n[x] 原文");
    expect(r.bbcode).toContain("☑ 完成");
    expect(r.bbcode).toContain("☐ 未完成");
    expect(r.bbcode).toContain("&#91;x&#93; 原文");
  });
  it("preserves non-1 starting numbers including nested content", () => {
    const r = convertMarkdown("3. 三\n   - 巢狀\n4. 四");
    expect(r.bbcode).toContain("[div]&#160;&#160;&#160;&#160;3. 三[/div]");
    expect(r.bbcode).toContain("[div]&#160;&#160;&#160;&#160;4. 四[/div]");
    expect(r.bbcode).toContain("[ul]");
    expect(r.warnings.join()).toContain("文字編號");
  });
  it("preserves table columns and escaped pipes", () => {
    const r = convertMarkdown("| A | B |\n| --- | --- |\n| a\\|b | **c** |");
    expect(r.bbcode).toContain("[td][div][b]A[/b][/div]");
    expect(r.bbcode).toContain("[td][div]a|b[/div]");
    expect((r.html.match(/<td>/g) || []).length).toBe(4);
    expect(r.plainText).toContain("a|b | c");
  });
  it("preserves quote blocks and paragraph spacing", () => {
    const r = convertMarkdown("> 引用\n>\n> 另一段");
    expect(r.bbcode).toBe(
      "[quote][div]引用[/div][div]&#160;[/div][div]另一段[/div][/quote]",
    );
  });
});
describe("code fidelity", () => {
  const code = "```sh\n\t[x] <div> **bold**\n\n  echo ok \\\n    --flag\n```";
  it("preserves each line and encodes syntax without parsing it", () => {
    const r = convertMarkdown(code, { codeHighlight: { enabled: false } });
    expect(r.bbcode).toContain(
      "[div][font=Courier New]&#160;&#160;&#160;&#160;&#91;x&#93;&#160;&lt;div&gt;&#160;**bold**[/font][/div]",
    );
    expect(r.bbcode).toContain("[div]&#160;[/div]");
    expect(r.plainText).toContain("  echo ok \\\n    --flag");
    expect(r.bbcode).not.toContain("[code]");
    expect(r.bbcode).not.toContain("[b]");
  });
  it("keeps code trailing blank lines", () =>
    expect(
      convertMarkdown("```\na\n\n```", { codeHighlight: { enabled: false } })
        .bbcode,
    ).toBe("[div][font=Courier New]a[/font][/div][div]&#160;[/div]"));
  it("handles an unclosed fence", () =>
    expect(
      convertMarkdown("```\n[div]\nhello", {
        codeHighlight: { enabled: false },
      }).bbcode,
    ).toBe(
      "[div][font=Courier New]&#91;div&#93;[/font][/div][div][font=Courier New]hello[/font][/div]",
    ));
  it("supports tilde and indented code", () => {
    expect(
      convertMarkdown("~~~\n[x]\n~~~", { codeHighlight: { enabled: false } })
        .bbcode,
    ).toContain("&#91;x&#93;");
    expect(
      convertMarkdown("    [x]", { codeHighlight: { enabled: false } }).bbcode,
    ).toContain("&#91;x&#93;");
  });
  it("expands tabs at column boundaries", () =>
    expect(expandTabs("a\tb\n\tX")).toBe("a   b\n    X"));
  it("validates tab options", () => {
    expect(convertMarkdown("```\n\tx\n```", { tabSize: 0 }).plainText).toBe(
      "    x",
    );
    expect(convertMarkdown("```\n\tx\n```", { tabSize: 2 }).plainText).toBe(
      "  x",
    );
  });
});
describe("links, HTML and injection", () => {
  it("converts valid web links and images", () => {
    const r = convertMarkdown(
      "[標題](https://example.com/?a=1&b=2)\n\n![圖](https://example.com/a.png)",
    );
    expect(r.bbcode).toContain(
      "[url=https://example.com/?a=1&amp;b=2]標題[/url]",
    );
    expect(r.bbcode).toContain("[img=https://example.com/a.png]");
    expect(r.html).toContain('referrerpolicy="no-referrer"');
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///tmp/a",
    "https://user:pass@example.com",
    "/relative",
  ])("removes unsafe destination %s", (url) => {
    const r = convertMarkdown(`[label](<${url}>)`);
    expect(r.html).not.toContain("<a ");
    expect(r.bbcode).not.toContain("[url=");
    expect(r.plainText).toContain("label");
  });
  it("degrades unsafe images to alt text", () => {
    const r = convertMarkdown("![不見了](file:///tmp/a.png)");
    expect(r.bbcode).toContain("圖片：不見了");
    expect(r.html).not.toContain("<img");
  });
  it("does not execute HTML or event attributes", () => {
    const r = convertMarkdown(
      "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>",
    );
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.warnings.join()).toContain("HTML");
  });
  it("quotes cannot break generated image attributes", () => {
    const r = convertMarkdown(
      '![" onerror="alert(1)](https://example.com/a.png)',
    );
    expect(r.html).toContain('alt="&quot; onerror=&quot;alert(1)"');
  });
  it("encodes BBCode attribute delimiters", () => {
    const r = convertMarkdown("[x](<https://example.com/[b]foo>)");
    expect(r.bbcode).toContain("%5Bb%5Dfoo");
    expect(r.bbcode).not.toContain("/[b]");
  });
  it("never double interprets code or escaped entities", () => {
    expect(
      convertMarkdown("`<img src=x onerror=alert(1)>`").html,
    ).not.toContain("<img");
    expect(convertMarkdown("&lt;script&gt;").html).toContain("&lt;script&gt;");
  });
});
describe("formulas and complete sample", () => {
  it("preserves inline formula syntax without Markdown formatting", () => {
    const r = convertMarkdown("$a_{x} * b * c$");
    expect(r.plainText).toBe("$a_{x} * b * c$");
    expect(r.html).not.toContain("<i>");
    expect(r.warnings.join()).toContain("LaTeX");
  });
  it("preserves multiline formulas", () => {
    const r = convertMarkdown("$$\na * b * c\n$$");
    expect(r.plainText).toBe("$$\na * b * c\n$$");
    expect(r.html).not.toContain("<i>");
  });
  it("supports bracket formulas", () => {
    expect(convertMarkdown("\\(x+y\\)").plainText).toBe("\\(x+y\\)");
    expect(convertMarkdown("\\[\nx\n\\]").warnings.join()).toContain("LaTeX");
  });
  it("produces deterministic dual output for the real sample", () => {
    const first = convertMarkdown(sample);
    expect(convertMarkdown(sample)).toEqual(first);
    expect(first.bbcode).toContain("[table");
    expect(first.html).toContain("<table");
    expect(first.plainText).toContain("const items");
    expect(first.bbcode).not.toContain("```");
    expect(first.bbcode).not.toContain("[code]");
  });
});

it("does not insert source newlines that Bahamut turns into extra br tags", () => {
  const result = convertMarkdown("```\na\n\nb\n```", {
    codeHighlight: { enabled: false },
  });
  expect(result.bbcode).toBe(
    "[div][font=Courier New]a[/font][/div][div]&#160;[/div][div][font=Courier New]b[/font][/div]",
  );
});
it("keeps numbered lists numbered in the plain-text clipboard", () => {
  expect(convertMarkdown("1. one\n2. two").plainText).toBe("1. one\n2. two");
});

it("preserves final code whitespace in the plain clipboard", () => {
  expect(convertMarkdown("```\na  \n\n``` ").plainText).toBe("a  \n");
});
