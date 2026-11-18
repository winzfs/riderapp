import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

test("Cloudflare overlay keeps current HTML and SW ahead of legacy Object.assign tables", async () => {
  const temp = mkdtempSync(join(tmpdir(), "rider-overlay-"));
  try {
    const old = [
      'const rsNewAssets={"/index.html":["old html","text/html"],"/sw.js":["old sw","application/javascript"],"/legacy.js":["legacy","application/javascript"]};',
      'const files={"/index.html":["very old html","text/html"]};',
      'Object.assign(rsNewAssets,{"/index.html":["overridden old html","text/html"],"/sw.js":["overridden old sw","application/javascript"]});',
      'export default {async fetch(request){const u=new URL(request.url),f=rsNewAssets[u.pathname]||files[u.pathname]||(u.pathname==="/"?rsNewAssets["/index.html"]:null);return new Response(f?.[0]||"missing",{headers:{"Content-Type":f?.[1]||"text/plain"}})}};',
    ].join("\n");
    const assets = {
      "/index.html": "<html>new rider UI</html>",
      "/sw.js": "const CACHE='new';",
      "/assets/rider-spot-4a494ebaaaad/app.mjs": "console.log('new rider UI')",
      "/mapdata/government.json": "{}",
    };
    const source = join(temp, "baseline.mjs");
    const dist = join(temp, "dist");
    const output = join(temp, "candidate.mjs");
    mkdirSync(dist);
    writeFileSync(source, old);
    for (const [path, value] of Object.entries(assets)) {
      const file = join(dist, path);
      mkdirSync(resolve(file, ".."), {recursive:true});
      writeFileSync(file, value);
    }
    writeFileSync(join(dist, "release.json"), JSON.stringify({files:Object.keys(assets)}));
    const hash = createHash("sha256").update(old).digest("hex");
    const run = spawnSync(process.execPath, [resolve("scripts/overlay-worker.mjs"), source, dist, output, hash], {encoding:"utf8"});
    assert.equal(run.status, 0, run.stderr);
    const candidate = readFileSync(output, "utf8");
    const context = {Response,URL};
    vm.runInNewContext(candidate.replace("export default {", "globalThis.handler = {"), context);
    for (const [path, expected] of Object.entries(assets)) {
      const response = await context.handler.fetch(new Request("https://example.test"+path));
      assert.equal(await response.text(), expected, path);
    }
    const root = await context.handler.fetch(new Request("https://example.test/"));
    assert.equal(await root.text(), assets["/index.html"]);
    const oldAsset = await context.handler.fetch(new Request("https://example.test/legacy.js"));
    assert.equal(await oldAsset.text(), "legacy");
  } finally {
    rmSync(temp, {recursive:true,force:true});
  }
});
