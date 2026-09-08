import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

// Run against real production assets; no service-worker or clipboard substitutes.
const temp = await mkdtemp(join(tmpdir(), "baha-pwa-"));
const artifacts =
  process.env.PWA_ARTIFACT_DIR || join(tmpdir(), "baha-pwa-evidence");
await mkdir(artifacts, { recursive: true });
const invalid = join(temp, "invalid");
await cp(resolve("dist"), invalid, { recursive: true });
await rm(join(invalid, "icons/icon-192.png"));
assert.throws(() =>
  execFileSync(process.execPath, ["scripts/build-pwa.mjs", invalid], {
    stdio: "pipe",
  }),
);
await cp(
  resolve("dist/icons/icon-192.png"),
  join(invalid, "icons/icon-192.png"),
);
await writeFile(join(invalid, "assets/oversized.js"), "x".repeat(2_097_153));
assert.throws(() =>
  execFileSync(process.execPath, ["scripts/build-pwa.mjs", invalid], {
    stdio: "pipe",
  }),
);
console.log("PASS: build rejects missing and oversized required resources.");
let root = join(temp, "a");
let failedRequests = 0;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
for (const version of ["a", "b", "c"]) {
  const dir = join(temp, version);
  await cp(resolve("dist"), dir, { recursive: true });
  const html = await readFile(join(dir, "index.html"), "utf8");
  await writeFile(
    join(dir, "index.html"),
    html.replace(
      "</head>",
      `<meta name="pwa-test-version" content="${version}"></head>`,
    ),
  );
  if (version === "c")
    await writeFile(
      join(dir, "assets/pwa-failure.js"),
      "// required test resource",
    );
  execFileSync(process.execPath, ["scripts/build-pwa.mjs", dir], {
    stdio: "pipe",
  });
}
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.endsWith("pwa-failure.js")) {
    failedRequests++;
    res.writeHead(503);
    res.end();
    return;
  }
  const file = join(root, pathname === "/" ? "index.html" : pathname);
  try {
    if (!file.startsWith(root + "/")) throw new Error("outside root");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({
  permissions: ["clipboard-read", "clipboard-write"],
  acceptDownloads: true,
});
const ready = (page) =>
  page.waitForFunction(
    () =>
      navigator.serviceWorker.controller &&
      document
        .querySelector("#pwa-status")
        .textContent.includes("已可離線使用"),
  );
const version = (page) =>
  page.locator('meta[name="pwa-test-version"]').getAttribute("content");
const draft =
  '# 離線測試\n\n```js\nconst value = "中文";\n```\n\n![外部圖片](https://offline-image.invalid/image.png)';
try {
  const fresh = await browser.newContext({ offline: true });
  const empty = await fresh.newPage();
  await assert.rejects(empty.goto(origin));
  await fresh.close();
  let page = await context.newPage();
  await page.goto(origin);
  await ready(page);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  assert.equal(manifest.errors.length, 0);
  assert.equal(JSON.parse(manifest.data).display, "standalone");
  await cdp.detach();
  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  await page.goto(`${origin}/?offline=1`);
  await ready(page);
  assert.equal(await version(page), "a");
  await page.locator("#input").fill(draft);
  for (const theme of ["xcode", "github", "vs2015"]) {
    await page.locator("#code-theme").selectOption(theme);
    await page.locator("#copy-rich").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.startsWith("已複製排版"),
    );
    const clipboard = await page.evaluate(async () => {
      const item = (await navigator.clipboard.read())[0];
      return {
        html: await (await item.getType("text/html")).text(),
        plain: await (await item.getType("text/plain")).text(),
      };
    });
    assert.match(clipboard.html, /中文/);
    assert.match(clipboard.html, /color:/);
    assert.match(clipboard.plain, /const value/);
    await page.locator("#copy-source").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.startsWith("已複製巴哈原始碼"),
    );
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /\[h2\]離線測試/,
    );
  }
  for (const kind of ["html", "txt"]) {
    const downloaded = page.waitForEvent("download");
    await page.locator(`#download-${kind}`).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), `bahamut-post.${kind}`);
    assert.match(await readFile(await download.path(), "utf8"), /中文/);
  }
  // Cache contains app files only, never article text or external image URLs.
  const keys = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  );
  assert(keys.every((url) => url.startsWith(origin + "/")));
  assert(!keys.some((url) => url.includes("offline-image")));
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
  const unknown = await context.newPage();
  await assert.rejects(unknown.goto(`${origin}/unknown-page`));
  await unknown.close();
  console.log(
    "PASS: cold offline failure; cached reopen; three themes; HTML/text clipboard; downloads; external image isolation; unknown route.",
  );

  await context.setOffline(false);
  // Show the real install affordance if the browser offers it; force visibility only for layout stress.
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        document.querySelector("#install-app").hidden = false;
        window.scrollTo(0, 0);
      }, theme);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: join(artifacts, `${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  const second = await context.newPage();
  await second.goto(`${origin}/index.html?second=1`);
  await ready(second);
  await second.locator("#input").fill("第二份原稿");
  root = join(temp, "b");
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration()).update(),
  );
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.getRegistration()).waiting),
  );
  await second.waitForFunction(() =>
    document.querySelector("#pwa-status").textContent.includes("有新版本"),
  );
  assert.equal(await page.locator("#input").inputValue(), draft);
  assert.equal(await second.locator("#input").inputValue(), "第二份原稿");
  await page.close();
  assert(
    await second.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration()).waiting),
    ),
  );
  assert.equal(await version(second), "a");
  await second.close();
  // Wait for worker activation without keeping a controlled document open.
  const deadline = Date.now() + 15_000;
  while (true) {
    page = await context.newPage();
    await page.goto(origin);
    await ready(page);
    if ((await version(page)) === "b") break;
    await page.close();
    if (Date.now() > deadline) throw new Error("B never activated");
  }
  assert.equal(await page.locator("#input").inputValue(), "");
  console.log(
    "PASS: two-tab update waits; drafts unchanged; B activates only after all old clients close; no draft persistence.",
  );

  root = join(temp, "c");
  await page.locator("#input").fill("失敗時保留原稿");
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const terminal = new Promise((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Worker installation did not finish")),
        15_000,
      );
      reg.addEventListener(
        "updatefound",
        () => {
          const worker = reg.installing;
          worker.addEventListener("statechange", () => {
            if (["installed", "redundant"].includes(worker.state)) {
              clearTimeout(timer);
              done(worker.state);
            }
          });
        },
        { once: true },
      );
    });
    await reg.update();
    return terminal;
  });
  assert.equal(state, "redundant");
  assert(failedRequests > 0);
  assert.equal(await page.locator("#input").inputValue(), "失敗時保留原稿");
  assert.match(
    await page.locator("#pwa-status").textContent(),
    /新版暫時無法下載/,
  );
  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  await page.goto(origin);
  await ready(page);
  assert.equal(await version(page), "b");
  await page.close();
  // Clear origin storage and verify there is no durable offline guarantee afterward.
  await context.setOffline(false);
  root = join(temp, "b");
  page = await context.newPage();
  await page.goto(origin);
  await ready(page);
  const clear = await context.newCDPSession(page);
  await clear.send("Storage.clearDataForOrigin", {
    origin,
    storageTypes: "all",
  });
  await clear.detach();
  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  await assert.rejects(page.goto(origin));
  console.log(
    `PASS: failed C install preserves B offline; cleared storage requires network. Screenshots: ${artifacts}`,
  );
} finally {
  await context.close();
  await browser.close();
  await new Promise((done) => server.close(done));
  await rm(temp, { recursive: true, force: true });
}
