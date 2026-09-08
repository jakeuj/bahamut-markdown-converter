// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { convertMarkdown } from "../src/converter";
const dom = (input: string) => {
  const r = convertMarkdown(input);
  const el = document.createElement("article");
  el.innerHTML = r.html;
  return { r, el };
};
describe("published-post regressions", () => {
  it("keeps nested quotes and their content inside the owning quote", () => {
    const { r, el } = dom(
      "> outer **bold** [link](https://example.com)\n>\n> > inner\n>\n> - item\n>\n> | A | B |\n> | - | - |\n> | x | y |\n\nafter",
    );
    expect(el.querySelector("blockquote blockquote")?.textContent).toContain(
      "inner",
    );
    expect(el.querySelector("blockquote ul li")?.textContent).toContain("item");
    expect(el.querySelectorAll("blockquote td")).toHaveLength(4);
    expect(el.querySelector("blockquote b")?.textContent).toBe("bold");
    expect(el.querySelector("blockquote a")?.getAttribute("href")).toBe(
      "https://example.com/",
    );
    expect(el.lastElementChild?.closest("blockquote")).toBeNull();
    expect(r.plainText).toContain("> > inner");
    expect(r.bbcode).not.toContain("引用：");
    expect(el.querySelector("blockquote")?.getAttribute("style")).toContain(
      "border-left",
    );
  });
  it.each([0, 3, 10])(
    "preserves start %s and aligns explicit continuation",
    (start) => {
      const { r, el } = dom(
        `${start}. first\n    second\n\n    paragraph\n${start + 1}. next`,
      );
      const text = el.textContent!;
      expect(text).toContain("\u00a0".repeat(4) + `${start}. first`);
      expect(text).toContain(
        "\u00a0".repeat(4 + `${start}. `.length) + "second",
      );
      expect(r.bbcode).not.toMatch(/\[(?:ol start|li value)=/);
      expect(r.warnings.join()).toContain("懸掛對齊");
    },
  );
  it("does not double native indentation and retains fallback descendants", () => {
    const { el } = dom("- parent\n\n  3. child\n     - grandchild");
    expect(el.querySelector("ul > li > div > div")?.textContent).toBe(
      "\u00a0".repeat(4) + "3. child",
    );
    expect(el.querySelector("ul > li > div > ul > li")?.textContent).toContain(
      "grandchild",
    );
    expect(convertMarkdown("3. parent\n\n   4. child").plainText).toContain(
      "        4. child",
    );
    expect(convertMarkdown("1. parent\n   - child").plainText).toContain(
      "\n    • child",
    );
  });
  it("distinguishes paragraphs, soft breaks, headings and separators", () => {
    expect(
      convertMarkdown(
        "one\ntwo\n\n\nthree\n\n# title\n\nbody\n\n---\n\n## last",
      ).plainText,
    ).toBe("one\ntwo\n\nthree\n\ntitle\nbody\n────────\nlast");
    expect(convertMarkdown("# A\n\n## B").plainText).toBe("A\n\nB");
  });
  it("spaces loose paragraphs but not tight lists or table cells", () => {
    expect(convertMarkdown("- one\n\n  two").html).toContain(
      "<div>one</div>\n<div>&#160;</div>\n<div>two</div>",
    );
    expect(convertMarkdown("- one\n- two").html).not.toContain("&#160;");
    const { el } = dom("| A | B |\n| - | - |\n| | x |");
    expect(el.querySelectorAll("td")).toHaveLength(4);
    expect(el.querySelectorAll("td div")).toHaveLength(4);
  });
  it("keeps all code blanks outside font spans and preserves plain whitespace", () => {
    const input = "~~~\na  \n\n   \n\tb\\\n\n~~~";
    const { r, el } = dom(input);
    expect(el.children).toHaveLength(5);
    for (const i of [1, 2, 4]) {
      expect(el.children[i].querySelector("span,font")).toBeNull();
      expect(el.children[i].textContent).toContain("\u00a0");
    }
    expect(el.querySelectorAll("span")).toHaveLength(2);
    expect(r.plainText).toBe("a  \n\n   \n    b\\\n");
    expect(r.bbcode).not.toContain("\n");
    expect(r.bbcode).not.toContain("[quote]");
  });
  it("warns once without changing literal entities or executing markup", () => {
    const { r, el } = dom(
      "`&amp; &#91; &#x20;`\n\n~~~\n&amp;amp; <img src=x onerror=alert(1)> [b]\n~~~",
    );
    expect(el.textContent).toContain("&amp; &#91; &#x20;");
    expect(el.textContent).toContain("&amp;amp;");
    expect(el.querySelector("img,b")).toBeNull();
    expect(r.warnings.filter((w) => w.startsWith("實體字面值"))).toHaveLength(
      1,
    );
  });
  it("does not warn for ordinary decoded entities or URL attributes", () => {
    const r = convertMarkdown(
      "&amp; &#91; &#x20;\n\n[x](https://example.com/?a=1&b=2)",
    );
    expect(r.warnings.filter((w) => w.startsWith("實體字面值"))).toHaveLength(
      0,
    );
  });
});

it("keeps heading separation inside fallback items", () => {
  const r = convertMarkdown("3. first\n\n   ## heading\n\n   body");
  expect(r.plainText).toBe("    3. first\n\n       heading\n       body");
});

it("preserves only explicit table alignments in every row and output", () => {
  const { r, el } = dom(
    "| L | C | R | D |\n| :--- | :---: | ---: | --- |\n| a | **b** | c | |\n| d | e | f | g |",
  );
  for (const row of el.querySelectorAll("tr")) {
    expect([...row.cells].map((c) => c.style.textAlign)).toEqual([
      "left",
      "center",
      "right",
      "",
    ]);
    expect(row.cells[3].hasAttribute("style")).toBe(false);
  }
  expect(el.querySelectorAll("tr:first-child b")).toHaveLength(4);
  expect(r.bbcode.match(/\[td align=right\]/g)).toHaveLength(3);
  expect(r.bbcode).not.toMatch(/tabindex|role=|overflow|\n/);
  expect(r.plainText).toContain("a | b | c | ");
  expect(el.querySelector("[role=region]")?.getAttribute("tabindex")).toBe("0");
});
it("keeps aligned tables safe inside quotes and warns once for multiple tables", () => {
  const table =
    "| A | B |\n| :---: | ---: |\n| [link](https://example.com) | ![pic](https://example.com/a.png) |\n| a\\|b | <img src=x onerror=alert(1)> |";
  const { r, el } = dom(
    table
      .split("\n")
      .map((l) => "> " + l)
      .join("\n") +
      "\n\n" +
      table,
  );
  expect(el.querySelectorAll("blockquote table")).toHaveLength(1);
  expect(el.querySelectorAll("table")).toHaveLength(2);
  expect(el.querySelectorAll("[onerror],script")).toHaveLength(0);
  expect(el.querySelectorAll("td img")).toHaveLength(2);
  expect(el.textContent).toContain("a|b");
  expect(r.warnings.filter((w) => w.startsWith("寬表格"))).toHaveLength(1);
  expect(convertMarkdown("no table").warnings).toEqual([]);
});
