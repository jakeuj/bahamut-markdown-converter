// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertMarkdown } from "../src/converter";
function parse(html: string) {
  const doc = document.createElement("div");
  doc.innerHTML = html;
  return doc;
}
describe("six heading levels", () => {
  it("preserves semantic levels and uses supported Bahamut forms", () => {
    const result = convertMarkdown(
      Array.from(
        { length: 6 },
        (_, i) => `${"#".repeat(i + 1)} Level ${i + 1}`,
      ).join("\n\n"),
    );
    const doc = parse(result.html);
    expect(
      [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) => el.tagName),
    ).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
    for (let i = 1; i <= 6; i++) {
      const h = doc.querySelector(`h${i}`) as HTMLElement;
      expect(h.style.fontSize).toBe(
        ["30px", "22px", "18px", "1em", "1em", "1em"][i - 1],
      );
      expect(h.style.margin).toBe("0px");
      expect(h.style.fontWeight).toBe("700");
      expect(h.style.lineHeight).toBe("1.5");
      expect(h.style.overflowWrap).toBe("anywhere");
      expect(result.bbcode).toContain(
        i <= 3
          ? `[h${i + 1}]Level ${i}[/h${i + 1}]`
          : `[div][b]Level ${i}[/b][/div]`,
      );
    }
    expect(result.bbcode).not.toMatch(/\[\/?h[56]\]|\n/);
    expect(result.warnings).toHaveLength(1);
    expect(result.plainText).toBe(
      "Level 1\n\nLevel 2\n\nLevel 3\n\nLevel 4\n\nLevel 5\n\nLevel 6",
    );
  });
  it("preserves multiline Setext heading breaks", () => {
    const r = convertMarkdown("第一行\n第二行\n===");
    expect(r.bbcode).toBe("[h2][div]第一行[/div][div]第二行[/div][/h2]");
    expect(parse(r.html).querySelector("h1")?.innerHTML).toBe(
      "第一行<br>第二行",
    );
    expect(r.plainText).toBe("第一行\n第二行");
  });
  it("handles Setext, inline styles, literal tags and hostile markup", () => {
    const r = convertMarkdown(
      "大標\n===\n\n中標\n---\n\n### **粗** *斜* [連結](https://example.com) `PATH` [b] 中文😀 <script>alert(1)</script>",
    );
    const d = parse(r.html);
    expect(d.querySelector("h1")?.textContent).toBe("大標");
    expect(d.querySelector("h2")?.textContent).toBe("中標");
    expect(d.querySelector("h3 b")?.textContent).toBe("粗");
    expect(d.querySelector("h3 i")?.textContent).toBe("斜");
    expect(d.querySelector("h3 a")?.getAttribute("href")).toBe(
      "https://example.com/",
    );
    expect(d.querySelector("h3")?.textContent).toContain(
      "PATH [b] 中文😀 <script>alert(1)</script>",
    );
    expect(d.querySelector("script")).toBeNull();
    expect(r.bbcode).toContain("&#91;b&#93;");
  });
  it("keeps headings in quotes, native lists and numbered fallback items", () => {
    const r = convertMarkdown(
      "> ### 引用\n\n- ## 清單\n\n3. # 首項\n\n   #### 子標\n\n   內容\n4. ###### 次項",
    );
    const d = parse(r.html);
    expect(d.querySelector("blockquote h3")?.textContent).toBe("引用");
    expect(d.querySelector("ul > li > h2")?.textContent).toBe("清單");
    expect(d.querySelector("h1")?.textContent?.replaceAll("\u00a0", " ")).toBe(
      "    3. 首項",
    );
    expect(d.querySelector("h4")?.textContent?.replaceAll("\u00a0", " ")).toBe(
      "       子標",
    );
    expect(d.querySelector("h6")?.textContent?.replaceAll("\u00a0", " ")).toBe(
      "    4. 次項",
    );
    expect(r.plainText.match(/3\./g)).toHaveLength(1);
    expect(r.bbcode).not.toContain("\n");
    expect(r.warnings.filter((x) => x.includes("四至六級"))).toHaveLength(1);
  });
  it("keeps existing structural gaps without adding heading wrappers", () => {
    const r = convertMarkdown("# A\n\n## B\n\nbody\n\n---\n\n### C");
    expect(r.bbcode).toBe(
      "[h2]A[/h2][div]&#160;[/div][h3]B[/h3][div]body[/div][hr][h4]C[/h4]",
    );
    expect(r.plainText).toBe("A\n\nB\nbody\n────────\nC");
    expect(r.warnings).toEqual([]);
  });
});
