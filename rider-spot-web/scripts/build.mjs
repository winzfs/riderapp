import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(process.argv[2] || join(root, "dist"));
const read = (path) => readFile(join(root, path), "utf8");
const legacy = gunzipSync(
  await readFile(join(root, "legacy/compatibility.mjs.gz")),
).toString("utf8");
const buildOptions = {
  absWorkingDir: root,
  bundle: true,
  minify: true,
  write: false,
  format: "esm",
  target: "chrome110",
};
const [app, worker, gps, reports, template, previousSw] = await Promise.all([
  build({
    ...buildOptions,
    stdin: {
      contents: legacy,
      sourcefile: "compatibility.mjs",
      resolveDir: join(root, "src"),
    },
  }),
  build({ ...buildOptions, entryPoints: ["src/route-worker.mjs"] }),
  read("src/native-gps.js"),
  read("src/map-reports.js"),
  read("legacy/index.html"),
  read("legacy/sw.js"),
]);
const encoded = {
  "app.mjs": app.outputFiles[0].text,
  "route-worker.mjs": worker.outputFiles[0].text,
  "native-gps.js": gps,
  "map-reports.js": reports,
};
const hash = createHash("sha256")
  .update(JSON.stringify([encoded, template, previousSw]))
  .digest("hex")
  .slice(0, 12);
const base = `/assets/rider-spot-${hash}`;
const versioned = Object.fromEntries(
  Object.entries(encoded).map(([name, body]) => [`${base}/${name}`, body]),
);
const oldApp =
  "/assets/index-rider-v35-cb5dc21ec4b4.js?ui=v52-stable-raster-camera";
const oldReports = "/rider-map-reports-v36-fd33eca4ded1.js";
const oldGps = "/rider-gps-recovery-v42.js?gps=v50";
const oldSync = "/rider-trip-sync-v18-eee13da20fdf.js";
function substitute(value) {
  const values = {
    [oldApp]: `${base}/app.mjs`,
    [oldReports]: `${base}/map-reports.js`,
    [oldGps]: `${base}/native-gps.js`,
  };
  return values[value] || value;
}
const html = template
  .replace(
    /<script defer src="\/rider-trip-sync-v18-eee13da20fdf\.js"><\/script>/,
    "",
  )
  .replace(/\bsrc="([^"]+)"/g, (_, path) => `src="${substitute(path)}"`);
const oldCore = JSON.parse(previousSw.match(/const CORE=(\[[^\n]+\]);/)[1]);
const core = [
  ...oldCore.filter((path) => path !== oldSync).map(substitute),
  `${base}/route-worker.mjs`,
];
const serviceWorker = previousSw
  .replace(/^const CACHE=.*$/m, `const CACHE='rider-spot-shell-${hash}';`)
  .replace(/^const CORE=.*$/m, `const CORE=${JSON.stringify(core)};`);
const files = { ...versioned, "/index.html": html, "/sw.js": serviceWorker };
for (const [path, contents] of Object.entries(files)) {
  const target = join(out, path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, contents);
}
await writeFile(
  join(out, "release.json"),
  JSON.stringify({ hash, files: Object.keys(files) }, null, 2) + "\n",
);
console.log(
  `Rider Spot web ${hash}: ${Object.keys(files).length} files in ${out}`,
);
