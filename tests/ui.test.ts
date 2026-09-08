// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import page from "../index.html?raw";
import { Blob as NodeBlob } from "node:buffer";
import { convertMarkdown } from "../src/converter";
const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let written: Record<string, Blob> | undefined;
let write: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;
let downloadBlob: Blob | undefined;
let downloaded: string[];
async function type(value: string) {
  get<HTMLTextAreaElement>("input").value = value;
  get("input").dispatchEvent(new Event("input"));
  await vi.advanceTimersByTimeAsync(200);
}
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  document.documentElement.innerHTML = page
    .replace(/<!doctype html>/i, "")
    .replace(/<\/?html[^>]*>/g, "");
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
    get length() {
      return storage.size;
    },
  });
  written = undefined;
  downloadBlob = undefined;
  downloaded = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn() })),
  );
  write = vi.fn().mockResolvedValue(undefined);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write, writeText },
  });
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(items: Record<string, Blob>) {
        written = items;
      }
    },
  );
  URL.createObjectURL = vi.fn((blob) => {
    downloadBlob = blob as Blob;
    return "blob:test";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.push(this.download);
  });
  await import("../src/main");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("complete converter UI", () => {
  it("begins with empty output and disabled exports", () => {
    expect(get<HTMLButtonElement>("copy-rich").disabled).toBe(true);
    expect(get("preview").hidden).toBe(true);
    expect(get("empty").hidden).toBe(false);
  });
  it("updates dual output automatically and counts emoji once", async () => {
    await type("# 😀");
    expect(get("input-count").textContent).toBe("3 字元");
    expect(get("preview").textContent).toContain("😀");
    expect(get<HTMLTextAreaElement>("source").value).toBe(
      "[div][b]😀[/b][/div]",
    );
  });
  it("waits for compositionend during Chinese input", async () => {
    get("input").dispatchEvent(new CompositionEvent("compositionstart"));
    await type("中文");
    expect(get("preview").innerHTML).toBe("");
    get("input").dispatchEvent(new CompositionEvent("compositionend"));
    expect(get("preview").textContent).toContain("中文");
  });
  it("copies the same HTML as preview and includes plain text", async () => {
    await type("**排版**");
    get("copy-rich").click();
    await vi.runAllTimersAsync();
    expect(write).toHaveBeenCalledOnce();
    expect(written).toHaveProperty("text/html");
    expect(written).toHaveProperty("text/plain");
    await expect(written!["text/html"].text()).resolves.toBe(
      convertMarkdown("**排版**").html,
    );
    expect(get("status").textContent).toContain("已複製排版");
  });
  it("offers selection fallback when rich clipboard is rejected", async () => {
    write.mockRejectedValue(new Error("denied"));
    await type("內容");
    get("copy-rich").click();
    await vi.runAllTimersAsync();
    expect(get("status").textContent).toContain("未允許");
    expect(get("select-preview").hidden).toBe(false);
    get("select-preview").click();
    expect(window.getSelection()?.toString()).toContain("內容");
  });
  it("selects source when text clipboard is rejected", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await type("內容");
    get("copy-source").click();
    await vi.runAllTimersAsync();
    expect(get("source-panel").hidden).toBe(false);
    expect(get("status").textContent).toContain("無法自動複製");
    const field = get<HTMLTextAreaElement>("source");
    expect(field.selectionEnd).toBe(field.value.length);
  });
  it("downloads both current formats, including pending input", async () => {
    await type("舊");
    get<HTMLTextAreaElement>("input").value = "新";
    get("download-txt").click();
    expect(downloaded).toEqual(["bahamut-post.txt"]);
    expect(downloadBlob?.type).toContain("text/plain");
    await expect(downloadBlob!.text()).resolves.toBe("[div]新[/div]");
    get("download-html").click();
    expect(downloaded.at(-1)).toBe("bahamut-post.html");
    expect(downloadBlob?.type).toContain("text/html");
  });
  it("supports keyboard tabs and manual shortcut", () => {
    get("preview-tab").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(get("source-tab").getAttribute("aria-selected")).toBe("true");
    get<HTMLTextAreaElement>("input").value = "快捷";
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }),
    );
    expect(get<HTMLTextAreaElement>("source").value).toContain("快捷");
  });
  it("clears both outputs and warnings after loading sample", () => {
    get("sample").click();
    expect(get("warnings").hidden).toBe(false);
    get("clear").click();
    expect(get<HTMLTextAreaElement>("source").value).toBe("");
    expect(get("preview").innerHTML).toBe("");
    expect(get("warnings").hidden).toBe(true);
  });
  it("stores only theme, never article content", async () => {
    await type("私密文章");
    get("theme").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("baha-theme")).toBe("dark");
  });
  it("keeps DOM inert for hostile input", async () => {
    await type("<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))");
    expect(get("preview").querySelector("img,script,[onerror],a")).toBeNull();
    expect(get("warnings").hidden).toBe(false);
  });
});

it("shares quotes, code styling and entity fidelity across all exports", async () => {
  const input = "> outer\n>\n> > inner\n\n3. item\n\n~~~\n&amp;\n\n~~~";
  const result = convertMarkdown(input);
  await type(input);
  get("copy-rich").click();
  await vi.runAllTimersAsync();
  await expect(written!["text/html"].text()).resolves.toBe(result.html);
  await expect(written!["text/plain"].text()).resolves.toBe(result.plainText);
  const expected = document.createElement("div");
  expected.innerHTML = result.html;
  expect(get("preview").innerHTML).toBe(expected.innerHTML);
  get("copy-source").click();
  await vi.runAllTimersAsync();
  expect(writeText).toHaveBeenCalledWith(result.bbcode);
  get("download-html").click();
  await expect(downloadBlob!.text()).resolves.toContain(result.html);
  get("download-txt").click();
  await expect(downloadBlob!.text()).resolves.toBe(result.bbcode);
});
