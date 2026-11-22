// Rider Spot native MapLibre route visibility regression fix (v31).
// Apply to the existing native-maplibre.js asset before publishing a new release.
// This is intentionally idempotent and never touches trip data.
function patchNativeRouteStyleLoad(source) {
  if (typeof source !== "string") throw TypeError("MapLibre source must be a string");
  const marker = "RiderSpot native course renderer v31";
  if (source.includes(marker)) return source;
  const edits = [
    [
      'if(disposed||!map.isStyleLoaded())return;',
      'if(disposed||!map.getStyle?.()?.layers)return;',
    ],
    [
      'map.on("style.load",install);',
      'function safeInstall(){try{install()}catch(err){console.warn("RiderSpot route layer deferred",err?.message||err)}}\n map.on("style.load",safeInstall);\n map.on("load",safeInstall);',
    ],
    [
      'set(data){current=data||EMPTY;if(map.isStyleLoaded())try{install()}catch(err){console.warn("course draw",err)}},',
      'set(data){current=data||EMPTY;safeInstall();},',
    ],
    [
      'disposed=true;map.off("style.load",install);',
      'disposed=true;map.off("style.load",safeInstall);map.off("load",safeInstall);',
    ],
  ];
  for (const [before] of edits) {
    if (source.split(before).length !== 2) {
      throw Error("Native route renderer source changed; inspect before patching: " + before);
    }
  }
  let output = source;
  for (const [before, after] of edits) output = output.replace(before, after);
  return "/* " + marker + ": register lines on style load before tiles settle. */\n" + output;
}

module.exports = { patchNativeRouteStyleLoad };
