// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { initMotion } from "../src/motion";
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(reduced = false) {
  document.body.innerHTML =
    '<div class="hero-copy"><h1>標題</h1></div><article class="rule-card">說明</article><div id="preview"><h1>文章</h1></div>';
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = reduced;
  vi.stubGlobal("matchMedia", () => media);
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel, onfinish: null }));
  vi.stubGlobal("IntersectionObserver", undefined);
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  return { media, cancel, animate };
}
it("leaves all content visible without observer support and excludes article output", () => {
  const { animate } = setup();
  dispose = initMotion();
  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.instances[0]).toBe(
    document.querySelector(".hero-copy h1"),
  );
  expect(
    document.querySelector(".rule-card")?.getAttribute("style"),
  ).toBeNull();
  expect(document.querySelector("#preview")?.innerHTML).toBe("<h1>文章</h1>");
});
it("respects initial and changing reduced motion preferences", () => {
  const { media, animate, cancel } = setup(true);
  dispose = initMotion();
  expect(animate).not.toHaveBeenCalled();
  dispose();
  media.matches = false;
  dispose = initMotion();
  expect(animate).toHaveBeenCalledOnce();
  media.matches = true;
  media.dispatchEvent(new Event("change"));
  expect(cancel).toHaveBeenCalledOnce();
  expect(document.documentElement.classList.contains("motion-ready")).toBe(
    false,
  );
});
it("reveals observed site sections once and disconnects on cleanup", () => {
  const { animate } = setup();
  let callback: IntersectionObserverCallback;
  const unobserve = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe = vi.fn();
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
  dispose = initMotion();
  const target = document.querySelector(".rule-card")!;
  callback!(
    [{ target, isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  expect(animate).toHaveBeenCalledTimes(2);
  expect(unobserve).toHaveBeenCalledWith(target);
  dispose();
  dispose = undefined;
  expect(disconnect).toHaveBeenCalledOnce();
});
