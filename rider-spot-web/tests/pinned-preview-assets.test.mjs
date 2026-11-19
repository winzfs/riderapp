import test from "node:test";
import assert from "node:assert/strict";
import { sourcePath } from "../edge/github-pinned-preview-assets.mjs";

test("preview gateway serves only pinned release UI assets", () => {
  assert.equal(sourcePath("/index.html"),"prebuilt/index.html");
  assert.equal(sourcePath("/sw.js"),"prebuilt/sw.js");
  assert.equal(sourcePath("/assets/rider-spot-16c1eecf6bac/app.mjs"),"prebuilt/app.mjs");
  assert.equal(sourcePath("/assets/rider-spot-16c1eecf6bac/premium-shell.css"),"prebuilt/premium-shell.css");
  assert.equal(sourcePath("/assets/rider-spot-06a4d2f6010a/app.mjs"),null);
  assert.equal(sourcePath("/assets/rider-spot-16c1eecf6bac/../../private"),null);
});
test("preview map data uses fixed file names and cannot escape the build tree", () => {
  assert.equal(sourcePath("/mapdata/manifest.json"),"data/korean-map/manifest.json");
  assert.equal(sourcePath("/mapdata/t3169-878.json"),"data/korean-map/t3169-878.json");
  assert.equal(sourcePath("/mapdata/../../secrets.json"),null);
  assert.equal(sourcePath("/api/industry-news"),null);
  assert.equal(sourcePath("/auth/callback"),null);
});
