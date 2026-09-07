import "./style.css";
import { convertMarkdown, type ConversionResult } from "./converter";
import { sample } from "./sample";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = el<HTMLTextAreaElement>("input");
const source = el<HTMLTextAreaElement>("source");
const preview = el("preview");
const status = el("status");
let result: ConversionResult = convertMarkdown("");
let timer: ReturnType<typeof setTimeout> | undefined;
let composing = false;
let activeTab: "preview" | "source" = "preview";
const count = (text: string) =>
  `${Array.from(text).length.toLocaleString("zh-TW")} 字元`;
function convert(announce = false) {
  clearTimeout(timer);
  result = convertMarkdown(input.value);
  source.value = result.bbcode;
  preview.innerHTML = result.html; // Only the converter's escaped, allowlisted HTML reaches this sink.
  preview.hidden = !result.html;
  el("empty").hidden = Boolean(result.html);
  el("input-count").textContent = count(input.value);
  el("output-count").textContent = count(
    activeTab === "preview" ? result.plainText : result.bbcode,
  );
  el("warning-list").replaceChildren(
    ...result.warnings.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
  el("warnings").hidden = !result.warnings.length;
  el("warning-count").textContent = String(result.warnings.length);
  ["copy-rich", "copy-source", "download-html", "download-txt"].forEach(
    (id) => {
      el<HTMLButtonElement>(id).disabled = !result.bbcode;
    },
  );
  el("select-preview").hidden = true;
  status.textContent = announce
    ? result.bbcode
      ? "已完成轉換。"
      : "貼上 Markdown，開始轉換。"
    : "";
}
function switchTab(tab: "preview" | "source", focus = false) {
  activeTab = tab;
  for (const id of ["preview", "source"] as const) {
    const selected = id === tab;
    el(`${id}-tab`).setAttribute("aria-selected", String(selected));
    el(`${id}-tab`).tabIndex = selected ? 0 : -1;
    el(`${id}-panel`).hidden = !selected;
  }
  el("output-count").textContent = count(
    tab === "preview" ? result.plainText : result.bbcode,
  );
  if (focus) el(`${tab}-tab`).focus();
}
input.addEventListener("input", () => {
  if (!composing) {
    clearTimeout(timer);
    timer = setTimeout(() => convert(), 180);
  }
});
input.addEventListener("compositionstart", () => {
  composing = true;
  clearTimeout(timer);
});
input.addEventListener("compositionend", () => {
  composing = false;
  convert();
});
el("convert").addEventListener("click", () => convert(true));
el("sample").addEventListener("click", () => {
  input.value = sample;
  convert();
  status.textContent = "已載入範例，可以直接修改試試看。";
});
el("clear").addEventListener("click", () => {
  input.value = "";
  convert();
  input.focus();
  status.textContent = "已清空內容。";
});
for (const tab of ["preview", "source"] as const) {
  el(`${tab}-tab`).addEventListener("click", () => switchTab(tab));
  el(`${tab}-tab`).addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      switchTab(
        e.key === "Home"
          ? "preview"
          : e.key === "End"
            ? "source"
            : activeTab === "preview"
              ? "source"
              : "preview",
        true,
      );
    }
  });
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    convert(true);
  }
});
if (/Mac|iPhone|iPad/.test(navigator.platform))
  el("shortcut").textContent = "⌘ ↵";
el("copy-rich").addEventListener("click", async () => {
  convert();
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([result.html], { type: "text/html" }),
        "text/plain": new Blob([result.plainText], { type: "text/plain" }),
      }),
    ]);
    status.textContent = "已複製排版。貼到巴哈編輯器後，請先確認預覽。";
  } catch {
    switchTab("preview");
    status.textContent =
      "瀏覽器未允許複製排版。請按下方按鈕選取預覽，再用 Ctrl/Cmd + C 手動複製。";
    el("select-preview").hidden = false;
  }
});
el("select-preview").addEventListener("click", () => {
  switchTab("preview");
  const range = document.createRange();
  range.selectNodeContents(preview);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  status.textContent = "已選取排版內容，請按 Ctrl/Cmd + C 複製。";
});
el("copy-source").addEventListener("click", async () => {
  convert();
  try {
    await navigator.clipboard.writeText(result.bbcode);
    status.textContent = "已複製巴哈原始碼。";
  } catch {
    switchTab("source");
    source.focus();
    source.select();
    status.textContent = "無法自動複製，已選取原始碼，請按 Ctrl/Cmd + C。";
  }
});
function download(kind: "html" | "txt") {
  convert();
  const content =
    kind === "html"
      ? `<!doctype html>\n<html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>巴哈貼文排版</title><style>body{font-family:system-ui,sans-serif;line-height:1.8;max-width:900px;margin:32px auto;padding:0 20px;overflow-wrap:anywhere}table{border-collapse:collapse}td{padding:8px}img{max-width:100%}</style></head><body>\n${result.html}\n</body></html>`
      : result.bbcode;
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        kind === "html"
          ? "text/html;charset=utf-8"
          : "text/plain;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `bahamut-post.${kind}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = `已產生 .${kind} 下載檔案。`;
}
el("download-html").addEventListener("click", () => download("html"));
el("download-txt").addEventListener("click", () => download("txt"));
const themeMedia = matchMedia("(prefers-color-scheme: dark)");
let chosenTheme: string | null = null;
try {
  chosenTheme = localStorage.getItem("baha-theme");
} catch {
  /* Storage can be disabled. */
}
function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  el("theme").setAttribute("aria-pressed", String(dark));
}
applyTheme(chosenTheme ? chosenTheme === "dark" : themeMedia.matches);
el("theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  applyTheme(dark);
  chosenTheme = dark ? "dark" : "light";
  try {
    localStorage.setItem("baha-theme", chosenTheme);
  } catch {
    /* Theme still works for this page. */
  }
});
themeMedia.addEventListener("change", (e) => {
  if (!chosenTheme) applyTheme(e.matches);
});
convert();
