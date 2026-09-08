interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** PWA lifecycle never reloads a page or persists editor contents. */
export function initPwa(enabled = import.meta.env.PROD): () => void {
  if (!enabled) return () => {};
  const button = document.getElementById("install-app") as HTMLButtonElement;
  const status = document.getElementById("pwa-status")!;
  const displayMode = matchMedia("(display-mode: standalone)");
  const listeners: Array<() => void> = [];
  let disposed = false;
  let installed = false;
  let prompt: InstallPromptEvent | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  let lastUpdate = -Infinity;
  let checking = false;
  let failed = false;
  let updateFailed = false;

  function listen(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }
  function standalone() {
    return (
      installed ||
      displayMode.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    );
  }
  function renderInstall() {
    button.hidden = !prompt || standalone();
  }
  function renderStatus() {
    if (disposed) return;
    const ready = registration?.active?.state === "activated";
    const messages: string[] = [];
    if (registration?.waiting?.state === "installed") {
      messages.push(
        "有新版本。請先保存原始 Markdown，關閉所有此工具的分頁與視窗後再開啟；本站不保存文章。",
      );
    }
    if (ready)
      messages.push(
        "已可離線使用。本站不保存文章；外部圖片不保證離線顯示，巴哈發文仍需連線。",
      );
    else if (failed)
      messages.push(
        "離線功能尚未就緒，請連線後重新開啟工具；目前仍可繼續轉換。",
      );
    if (ready && updateFailed)
      messages.push("新版暫時無法下載，繼續使用目前版本；恢復連線後會再檢查。");
    if (!navigator.onLine)
      messages.push("目前處於離線狀態。外部圖片與巴哈發文需要連線。");
    status.textContent = messages.join(" ");
    status.hidden = messages.length === 0;
  }
  listen(window, "beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    renderInstall();
  });
  listen(window, "appinstalled", () => {
    installed = true;
    prompt = undefined;
    renderInstall();
  });
  listen(displayMode, "change", renderInstall);
  listen(button, "click", async () => {
    const current = prompt;
    if (!current || standalone()) return;
    // Each browser event can be used once. A new event enables a later retry.
    prompt = undefined;
    renderInstall();
    try {
      await current.prompt();
      const choice = await current.userChoice;
      if (choice.outcome === "accepted") installed = true;
    } catch {
      // Installation is optional; keep the converter usable.
    }
    if (!disposed) renderInstall();
  });
  renderInstall();

  async function checkUpdate() {
    if (
      !registration ||
      checking ||
      !navigator.onLine ||
      document.hidden ||
      Date.now() - lastUpdate < 60_000
    )
      return;
    lastUpdate = Date.now();
    checking = true;
    try {
      await registration.update();
      updateFailed = false;
    } catch {
      updateFailed = true;
    } finally {
      checking = false;
      renderStatus();
    }
  }
  listen(window, "online", () => {
    renderStatus();
    void checkUpdate();
  });
  listen(window, "offline", renderStatus);
  listen(document, "visibilitychange", () => {
    void checkUpdate();
  });

  if ("serviceWorker" in navigator) {
    const workers = new WeakSet<ServiceWorker>();
    function watch(worker: ServiceWorker | null) {
      if (!worker || workers.has(worker)) return;
      workers.add(worker);
      listen(worker, "statechange", () => {
        if (worker.state === "redundant") {
          if (registration?.active) updateFailed = true;
          else failed = true;
        } else if (
          worker.state === "installed" ||
          worker.state === "activated"
        ) {
          failed = false;
          updateFailed = false;
        }
        renderStatus();
      });
    }
    listen(navigator.serviceWorker, "controllerchange", renderStatus);
    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((value) => {
        if (disposed) return;
        registration = value;
        watch(value.active);
        watch(value.waiting);
        watch(value.installing);
        listen(value, "updatefound", () => watch(value.installing));
        renderStatus();
        void checkUpdate();
      })
      .catch(() => {
        failed = true;
        renderStatus();
      });
  } else {
    failed = true;
  }
  renderStatus();
  return () => {
    disposed = true;
    listeners.forEach((remove) => remove());
  };
}
