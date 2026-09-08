import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSW } from "workbox-build";

const dist = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(
  await readFile(join(dist, "manifest.webmanifest"), "utf8"),
);
const required = new Set([
  "index.html",
  "manifest.webmanifest",
  "favicon.svg",
  "icons/apple-touch-icon.png",
  ...manifest.icons.map(({ src }) => src.replace(/^\//, "")),
]);
async function addAssets(directory, prefix = "assets") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory())
      await addAssets(join(directory, entry.name), relative);
    else if (!entry.name.endsWith(".map")) required.add(relative);
  }
}
await addAssets(join(dist, "assets"));
await Promise.all([...required].map((path) => access(join(dist, path))));
const result = await generateSW({
  globDirectory: dist,
  globPatterns: [...required],
  swDest: join(dist, "sw.js"),
  inlineWorkboxRuntime: true,
  sourcemap: false,
  cacheId: "bahamut-converter",
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  // Only the app's two entry paths may use the offline document.
  navigateFallback: "index.html",
  navigateFallbackAllowlist: [/^\/(?:index\.html)?(?:\?.*)?$/],
  ignoreURLParametersMatching: [],
  manifestTransforms: [
    async (entries) => {
      const included = new Set(entries.map(({ url }) => url));
      const missing = [...required].filter((path) => !included.has(path));
      if (missing.length)
        throw new Error(`PWA precache missing: ${missing.join(", ")}`);
      return { manifest: entries, warnings: [] };
    },
  ],
});
if (result.warnings.length) throw new Error(result.warnings.join("\n"));
console.log(`PWA: precached ${result.count} files (${result.size} bytes).`);
