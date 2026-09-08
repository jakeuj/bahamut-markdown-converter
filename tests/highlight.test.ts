// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { convertMarkdown } from "../src/converter";
import { parseHighlight, highlightCode } from "../src/highlight";
import hljs from "highlight.js/lib/core";
const fence = (lang: string, code: string) =>
  "```" + lang + "\n" + code + "\n```";
const article = (html: string) => {
  const el = document.createElement("article");
  el.innerHTML = html;
  return el;
};
describe("code highlighting", () => {
  it.each(["xcode", "github", "vs2015"] as const)(
    "shares %s colors and preserves text",
    (theme) => {
      const code =
        '/* 中文 😀\n   multi line */\nconst x = "[b]<script>&amp;";  \n\n\tconsole.log(x);\n';
      const input = fence("js", code);
      const r = convertMarkdown(input, { codeHighlight: { theme } });
      expect(r.warnings.join()).not.toContain("失敗");
      expect(r.bbcode).toContain("[color=#");
      expect(r.bbcode).not.toContain("undefined");
      expect(r.bbcode).not.toContain("\n");
      const el = article(r.html);
      expect(el.querySelector("script")).toBeNull();
      const rows = Array.from(el.querySelector("td")!.children);
      expect(
        rows
          .map((e) => e.textContent!.replace(/\u00a0/g, " "))
          .join("\n")
          .replace(/\n $/, "\n"),
      ).toContain('const x = "[b]<script>&amp;";  ');
      expect(rows).toHaveLength(code.split("\n").length);
      expect(rows.at(-1)!.querySelector("span,font")).toBeNull();
      expect(r.plainText).toBe(
        convertMarkdown(input, { codeHighlight: { enabled: false } }).plainText,
      );
      expect(el.querySelector("[role=region]")?.getAttribute("tabindex")).toBe(
        "0",
      );
    },
  );
  it("uses fence language before defaults, including aliases and metadata", () => {
    const input = fence("js title=test", "const answer = 42;");
    expect(
      convertMarkdown(input, { codeHighlight: { defaultLanguage: "python" } })
        .bbcode,
    ).toBe(convertMarkdown(input).bbcode);
    expect(
      convertMarkdown(fence("javascript", "const answer = 42;")).bbcode,
    ).toBe(convertMarkdown(input).bbcode);
  });
  it("supports automatic and explicit defaults for unlabelled and indented code", () => {
    for (const input of [
      fence("", "const answer = 42;"),
      "    const answer = 42;",
    ]) {
      expect(convertMarkdown(input).bbcode).toContain("[table");
      expect(
        convertMarkdown(input, {
          codeHighlight: { defaultLanguage: "javascript" },
        }).bbcode,
      ).toContain("[color=");
    }
    expect(
      convertMarkdown(fence("", ""), {
        codeHighlight: { defaultLanguage: "auto" },
      }).bbcode,
    ).not.toContain("[table");
  });
  it.each(["text", "txt", "plaintext", "made-up"])(
    "keeps %s monochrome",
    (lang) => {
      const input = fence(lang, "const x = 1;");
      expect(convertMarkdown(input).bbcode).toBe(
        convertMarkdown(input, { codeHighlight: { enabled: false } }).bbcode,
      );
    },
  );
  it("deduplicates unknown-language warnings and honors disabled highlighting", () => {
    const input = fence("unknown", "a") + "\n\n" + fence("unknown", "b");
    expect(
      convertMarkdown(input).warnings.filter((w) =>
        w.includes("不支援的程式語言"),
      ),
    ).toHaveLength(1);
    expect(
      convertMarkdown(input, {
        codeHighlight: { enabled: false },
      }).warnings.join(),
    ).not.toContain("不支援的程式語言");
  });
  it("limits per-block and aggregate processing without losing text", () => {
    const huge = fence("js", "x".repeat(20001));
    expect(convertMarkdown(huge).bbcode).not.toContain("[table");
    const block = fence("js", "//" + "x".repeat(17998));
    const result = convertMarkdown(Array(6).fill(block).join("\n\n"));
    expect(result.bbcode.match(/\[table /g)).toHaveLength(5);
    expect(result.warnings.join()).toContain("上限");
  });
  it("falls back on highlighter errors and text mismatch", () => {
    const spy = vi.spyOn(hljs, "highlight").mockImplementation(() => {
      throw new Error("test");
    });
    const input = fence("js", "const a=1;");
    expect(convertMarkdown(input).warnings.join()).toContain("上色失敗");
    spy.mockRestore();
    expect(() =>
      parseHighlight(
        '<span class="hljs-string">different</span>',
        "original",
        "xcode",
        "js",
      ),
    ).toThrow();
    expect(() => parseHighlight("<img src=x>", "", "xcode", "js")).toThrow();
    expect(() =>
      parseHighlight('<span onclick="x">a</span>', "a", "xcode", "js"),
    ).toThrow();
  });
  it("preserves inherited foreground, background, bold, italic and underline", () => {
    const data = parseHighlight(
      '<span class="hljs-strong"><span class="hljs-emphasis"><span class="hljs-link">a\nb</span></span></span>',
      "a\nb",
      "vs2015",
      "markdown",
    );
    expect(data.lines[1][0].style).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      color: "#569cd6",
    });
    expect(
      highlightCode("+ added\n- deleted", "diff", "github")!.lines[0].some(
        (p) => p.style.background === "#f0fff4",
      ),
    ).toBe(true);
  });
  it("computes each block once across outputs", () => {
    const spy = vi.spyOn(hljs, "highlight");
    convertMarkdown(fence("js", "const answer=42;"));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
