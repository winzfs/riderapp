import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
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
const [
  app,
  worker,
  gps,
  reports,
  tabResume,
  dailyCss,
  template,
  previousSw,
  design,
  workTools,
] = await Promise.all([
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
  build({
    ...buildOptions,
    format: "iife",
    entryPoints: ["src/map-reports.js"],
  }),
  read("src/tab-resume.js"),
  read("src/daily-timeline.css"),
  read("legacy/index.html"),
  read("legacy/sw.js"),
  build({ ...buildOptions, entryPoints: ["src/design-system.css"] }),
  build({
    ...buildOptions,
    format: "iife",
    entryPoints: ["src/workspace-tools.js"],
  }),
]);
const encoded = {
  "app.mjs": app.outputFiles[0].text,
  "route-worker.mjs": worker.outputFiles[0].text,
  "native-gps.js": gps,
  "map-reports.js": reports.outputFiles[0].text,
  "design-system.css": design.outputFiles[0].text,
  "workspace-tools.js": workTools.outputFiles[0].text,
  "tab-resume.js": tabResume,
  "daily-timeline.css": dailyCss,
};
const mapDataDir = join(root, "data/korean-map");
const mapNames = await readdir(mapDataDir).catch(() => []);
const publicMapData = Object.fromEntries(await Promise.all(
  mapNames.filter((name) => /^(?:admin|government|manifest|t\d+-\d+)\.json$/.test(name))
    .map(async (name) => ["/mapdata/" + name, await readFile(join(mapDataDir, name), "utf8")]),
));
const hash = createHash("sha256")
  .update(JSON.stringify([encoded, template, previousSw, publicMapData]))
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
const oldTabResume = "/rider-tab-resume-v54.js";
function substitute(value) {
  const values = {
    [oldApp]: `${base}/app.mjs`,
    [oldReports]: `${base}/map-reports.js`,
    [oldGps]: `${base}/native-gps.js`,
    [oldTabResume]: `${base}/tab-resume.js`,
    "/rider-tools-v35-e84f32f8a5e5.js": `${base}/workspace-tools.js`,
  };
  return values[value] || value;
}
const html = template
  .replace(
    /<script defer src="\/rider-trip-sync-v18-eee13da20fdf\.js"><\/script>/,
    "",
  )
  .replace(/\bsrc="([^"]+)"/g, (_, path) => `src="${substitute(path)}"`)
  .replace(
    "</head>",
    `<link rel="stylesheet" href="${base}/design-system.css"><link rel="stylesheet" href="${base}/daily-timeline.css"></head>`,
  );
const oldCore = JSON.parse(previousSw.match(/const CORE=(\[[^\n]+\]);/)[1]);
const core = [
  ...oldCore
    .filter((path) => path !== oldSync && !/^\/[^?]+\.css(?:\?|$)/.test(path))
    .map(substitute),
  `${base}/design-system.css`,
  `${base}/workspace-tools.js`,
  `${base}/route-worker.mjs`,
  `${base}/tab-resume.js`,
  `${base}/daily-timeline.css`,
];
const serviceWorker = previousSw
  .replace(/^const CACHE=.*$/m, `const CACHE='rider-spot-shell-${hash}';`)
  .replace(/^const CORE=.*$/m, `const CORE=${JSON.stringify(core)};`);
const files = { ...versioned, ...publicMapData, "/index.html": html, "/sw.js": serviceWorker };
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
