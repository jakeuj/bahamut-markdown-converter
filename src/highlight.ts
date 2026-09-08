import hljs from "highlight.js/lib/core";
import { Parser } from "htmlparser2";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import java from "highlight.js/lib/languages/java";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import bash from "highlight.js/lib/languages/bash";
import powershell from "highlight.js/lib/languages/powershell";
import sql from "highlight.js/lib/languages/sql";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import xcode from "./themes/xcode.txt?raw";
import github from "./themes/github.txt?raw";
import vs2015 from "./themes/vs2015.txt?raw";
const grammars = {
  javascript,
  typescript,
  c,
  cpp,
  csharp,
  java,
  python,
  go,
  rust,
  bash,
  powershell,
  sql,
  json,
  yaml,
  xml,
  css,
  php,
  ruby,
  markdown,
  diff,
};
Object.entries(grammars).forEach(([name, grammar]) =>
  hljs.registerLanguage(name, grammar),
);
export const codeLanguages = Object.keys(grammars);
export type CodeTheme = "xcode" | "github" | "vs2015";
export interface HighlightOptions {
  enabled?: boolean;
  theme?: CodeTheme;
  defaultLanguage?: string;
}
export interface Style {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}
export interface Fragment {
  text: string;
  style: Style;
}
export interface Highlighted {
  lines: Fragment[][];
  base: Style;
}
type Rule = {
  selectors: string[][];
  style: Style;
  specificity: number;
  order: number;
};
const color = (value: string) => {
  value =
    (
      { black: "#000000", white: "#ffffff", gold: "#ffd700" } as Record<
        string,
        string
      >
    )[value] ?? value;
  if (/^#[0-9a-f]{3}$/i.test(value))
    value =
      "#" +
      value
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("");
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
};
// Only translate the fixed, bundled upstream themes. Never parse user CSS.
function rules(css: string): Rule[] {
  const result: Rule[] = [];
  for (const m of css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const style: Style = {};
    for (const declaration of m[2].split(";")) {
      const [key, value] = declaration.split(":").map((s) => s.trim());
      if (key === "color") style.color = color(value);
      if (key === "background" || key === "background-color")
        style.background = color(value);
      if (key === "font-weight")
        style.bold = value === "bold" || Number(value) >= 600;
      if (key === "font-style") style.italic = value === "italic";
      if (key === "text-decoration") style.underline = value === "underline";
    }
    for (const selector of m[1].split(",").map((s) => s.trim())) {
      if (
        !/^\.[\w-]+(?:\.[\w-]+)*(?:\s+\.[\w-]+(?:\.[\w-]+)*)*$/.test(selector)
      )
        continue;
      const selectors = selector.split(/\s+/).map((s) => s.slice(1).split("."));
      result.push({
        selectors,
        style,
        specificity: selectors.flat().length,
        order: result.length,
      });
    }
  }
  return result.sort(
    (a, b) => a.specificity - b.specificity || a.order - b.order,
  );
}
const themes = {
  xcode: rules(xcode),
  github: rules(github),
  vs2015: rules(vs2015),
};
function resolve(theme: Rule[], path: string[][], inherited: Style): Style {
  const style = { ...inherited };
  for (const rule of theme) {
    let at = path.length - 1;
    let matched = true;
    for (let i = rule.selectors.length - 1; i >= 0; i--) {
      const classes = rule.selectors[i];
      if (i === rule.selectors.length - 1) {
        if (!classes.every((c) => path[at]?.includes(c))) {
          matched = false;
          break;
        }
      } else {
        while (at >= 0 && !classes.every((c) => path[at].includes(c))) at--;
        if (at < 0) {
          matched = false;
          break;
        }
      }
      at--;
    }
    if (matched) Object.assign(style, rule.style);
  }
  return style;
}
export function parseHighlight(
  html: string,
  original: string,
  themeName: CodeTheme,
  language: string,
): Highlighted {
  const theme = themes[themeName];
  const path = [["hljs", language]];
  const base = resolve(theme, path, {});
  const stack: Style[] = [base];
  const lines: Fragment[][] = [[]];
  let recovered = "";
  let invalid = false;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (
          name !== "span" ||
          Object.keys(attrs).some((k) => k !== "class") ||
          !/^[\w -]*$/.test(attrs.class ?? "")
        )
          invalid = true;
        path.push((attrs.class ?? "").split(/\s+/));
        stack.push(resolve(theme, path, stack.at(-1)!));
      },
      onclosetag(name, implied) {
        if (name !== "span" || stack.length === 1 || implied) invalid = true;
        if (stack.length > 1) {
          stack.pop();
          path.pop();
        }
      },
      ontext(text) {
        recovered += text;
        text.split("\n").forEach((part, i) => {
          if (i) lines.push([]);
          if (part)
            lines.at(-1)!.push({ text: part, style: { ...stack.at(-1)! } });
        });
      },
      oncomment() {
        invalid = true;
      },
      onprocessinginstruction() {
        invalid = true;
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  if (invalid || stack.length !== 1 || recovered !== original)
    throw new Error("Invalid highlighting output");
  return { lines, base };
}
export function highlightCode(
  code: string,
  language: string,
  theme: CodeTheme,
): Highlighted | undefined {
  const result =
    language === "auto"
      ? hljs.highlightAuto(code, codeLanguages)
      : hljs.highlight(code, { language, ignoreIllegals: true });
  if (!result.language) return;
  return parseHighlight(result.value, code, theme, result.language);
}
export const supportsLanguage = (name: string) =>
  Boolean(hljs.getLanguage(name));
