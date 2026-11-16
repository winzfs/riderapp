import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Overlay built assets through the existing Worker asset table. All API handlers,
// OAuth, older asset URLs and headers are copied from a known deployment snapshot.
export function overlayWorker(source, releaseAssets, expectedSha) {
  const sha = createHash("sha256").update(source).digest("hex");
  if (sha !== expectedSha) throw Error(`Worker snapshot hash mismatch: ${sha}`);
  const declaration = "const files=";
  const start = source.indexOf(declaration);
  const end = source.indexOf("\n", start);
  if (
    start < 0 ||
    end < 0 ||
    source.indexOf(declaration, start + declaration.length) >= 0
  )
    throw Error("Unexpected Worker asset table");
  const files = JSON.parse(
    source
      .slice(start + declaration.length, end)
      .trimEnd()
      .replace(/;$/, ""),
  );
  for (const [path, body] of Object.entries(releaseAssets)) {
    if (
      path !== "/index.html" &&
      path !== "/sw.js" &&
      !/^\/assets\/rider-spot-[0-9a-f]{12}\/[a-z.-]+$/.test(path)
    ) {
      throw Error(`Unexpected release asset: ${path}`);
    }
    files[path] = [
      body,
      path.endsWith(".html")
        ? "text/html; charset=utf-8"
        : path.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "application/javascript; charset=utf-8",
    ];
  }
  return (
    source.slice(0, start + declaration.length) +
    JSON.stringify(files) +
    ";" +
    source.slice(end)
  );
}

const [input, directory, output, expectedSha] = process.argv.slice(2);
if (!input || !directory || !output || !expectedSha) {
  throw Error(
    "Usage: node scripts/overlay-worker.mjs BASELINE.mjs DIST WORKER.mjs BASELINE_SHA256",
  );
}
const manifest = JSON.parse(
  await readFile(join(directory, "release.json"), "utf8"),
);
const assets = Object.fromEntries(
  await Promise.all(
    manifest.files.map(async (path) => [
      path,
      await readFile(join(directory, path), "utf8"),
    ]),
  ),
);
await writeFile(
  output,
  overlayWorker(await readFile(input, "utf8"), assets, expectedSha),
);
