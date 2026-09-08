// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initPwa } from "../src/pwa";

class Worker extends EventTarget {
  constructor(public state: string) {
    super();
  }
  change(state: string) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
class Registration extends EventTarget {
  active: Worker | null = null;
  waiting: Worker | null = null;
  installing: Worker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
}
let registration: Registration;
let container: EventTarget & { register: ReturnType<typeof vi.fn> };
let media: EventTarget & { matches: boolean };
let dispose: () => void;
const text = () => document.getElementById("pwa-status")!.textContent;
const button = () =>
  document.getElementById("install-app") as HTMLButtonElement;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function offer(outcome = "dismissed") {
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    },
  );
  window.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  document.body.innerHTML =
    '<button id="install-app" hidden>安裝</button><p id="pwa-status" hidden></p><p id="status">已複製</p><textarea id="input">原稿</textarea>';
  registration = new Registration();
  container = Object.assign(new EventTarget(), {
    register: vi.fn().mockResolvedValue(registration),
  });
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("navigator", { serviceWorker: container, onLine: true });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  dispose = () => {};
});
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PWA lifecycle", () => {
  it("does not register or offer installation in development", () => {
    dispose = initPwa(false);
    offer();
    expect(container.register).not.toHaveBeenCalled();
    expect(button().hidden).toBe(true);
  });
  it("only offers installation on browser event; dismissal permits a new event", async () => {
    dispose = initPwa(true);
    expect(button().hidden).toBe(true);
    const first = offer();
    expect(first.defaultPrevented).toBe(true);
    expect(button().hidden).toBe(false);
    button().click();
    await flush();
    expect(first.prompt).toHaveBeenCalledOnce();
    expect(button().hidden).toBe(true);
    const second = offer("accepted");
    button().click();
    await flush();
    expect(second.prompt).toHaveBeenCalledOnce();
    expect(button().hidden).toBe(true);
    offer();
    expect(button().hidden).toBe(true);
  });
  it("hides installation in standalone mode and after appinstalled", () => {
    dispose = initPwa(true);
    offer();
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(button().hidden).toBe(true);
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    expect(button().hidden).toBe(false);
    window.dispatchEvent(new Event("appinstalled"));
    offer();
    expect(button().hidden).toBe(true);
  });
  it("does not claim offline readiness before activation", async () => {
    const worker = (registration.installing = new Worker("installing"));
    dispose = initPwa(true);
    await flush();
    expect(container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(text()).not.toContain("已可離線");
    worker.change("installed");
    expect(text()).not.toContain("已可離線");
    registration.installing = null;
    registration.active = worker;
    worker.change("activated");
    expect(text()).toContain("已可離線使用");
  });
  it("reports an existing waiting version without changing content or clipboard status", async () => {
    registration.active = new Worker("activated");
    registration.waiting = new Worker("installed");
    dispose = initPwa(true);
    await flush();
    expect(text()).toContain("關閉所有此工具的分頁與視窗");
    container.dispatchEvent(new Event("controllerchange"));
    expect(
      (document.getElementById("input") as HTMLTextAreaElement).value,
    ).toBe("原稿");
    expect(document.getElementById("status")!.textContent).toBe("已複製");
  });
  it("watches future updates and keeps the active version after installation failure", async () => {
    registration.active = new Worker("activated");
    dispose = initPwa(true);
    await flush();
    const worker = (registration.installing = new Worker("installing"));
    registration.dispatchEvent(new Event("updatefound"));
    worker.change("redundant");
    expect(text()).toContain("已可離線使用");
    expect(text()).toContain("新版暫時無法下載");
    const next = (registration.installing = new Worker("installing"));
    registration.dispatchEvent(new Event("updatefound"));
    registration.waiting = next;
    next.change("installed");
    expect(text()).toContain("有新版本");
    expect(text()).not.toContain("暫時無法下載");
  });
  it("reports failed first installation, registration rejection and unsupported browsers", async () => {
    registration.installing = new Worker("installing");
    dispose = initPwa(true);
    await flush();
    registration.installing.change("redundant");
    expect(text()).toContain("尚未就緒");
    dispose();
    container.register.mockRejectedValue(new Error("blocked"));
    dispose = initPwa(true);
    await flush();
    expect(text()).toContain("尚未就緒");
    dispose();
    vi.stubGlobal("navigator", { onLine: true });
    dispose = initPwa(true);
    expect(text()).toContain("尚未就緒");
  });
  it("throttles updates on visibility and network recovery and skips offline checks", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    registration.active = new Worker("activated");
    dispose = initPwa(true);
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
    now += 60_000;
    Object.assign(navigator, { onLine: false });
    window.dispatchEvent(new Event("offline"));
    expect(text()).toContain("目前處於離線");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
    Object.assign(navigator, { onLine: true });
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain("目前處於離線");
  });
  it("cleans up listeners and ignores late registration results", async () => {
    dispose = initPwa(true);
    dispose();
    await flush();
    offer();
    expect(button().hidden).toBe(true);
    expect(registration.update).not.toHaveBeenCalled();
  });
  it("clears a failed update check after the connection recovers", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    registration.active = new Worker("activated");
    registration.update.mockRejectedValueOnce(new Error("network unavailable"));
    dispose = initPwa(true);
    await flush();
    expect(text()).toContain("新版暫時無法下載");
    now += 60_000;
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(text()).not.toContain("新版暫時無法下載");
    expect(text()).toContain("已可離線使用");
  });
});
