// Neo-flat, slightly faceted high-contrast SVG icons for rider gloves/small screens.
// One crisp silhouette and a restrained gloss plane per part.
const symbols=Object.freeze({
  "엔진오일": "<path d=\"M17 20h12v-7h16v8l8 8v24H12V29z\" fill=\"url(#body)\"/><path d=\"M31 13h14v9H31z\" fill=\"#ee944b\"/><path d=\"M22 22h9l-14 19V31z\" fill=\"#fff\" opacity=\".17\"/><path d=\"M36 30c-5 6-8 11-8 15a8 8 0 0 0 16 0c0-4-3-9-8-15z\" fill=\"#f39347\"/><path d=\"M32 45c0-3 2-6 5-9\" stroke=\"#ffdb9e\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/>",
  "앞 타이어": "<path d=\"M24 8c-11 3-14 15-14 24s3 21 14 24l19-2c9-4 12-14 12-22S52 13 43 10z\" fill=\"url(#metal)\"/><ellipse cx=\"36\" cy=\"32\" rx=\"13\" ry=\"23\" fill=\"#1e3730\"/><ellipse cx=\"37\" cy=\"32\" rx=\"8\" ry=\"16\" fill=\"#80938a\"/><ellipse cx=\"38\" cy=\"32\" rx=\"5\" ry=\"12\" fill=\"#182e27\"/><path d=\"M18 18l10-5M15 30l9-5M15 42l10-4M21 52l8-4\" stroke=\"#c1d0c4\" stroke-width=\"2.2\" opacity=\".7\" stroke-linecap=\"round\"/><path d=\"M47 19c4 8 4 19 0 27\" stroke=\"#ef9149\" stroke-width=\"2.4\" fill=\"none\"/>",
  "뒤 타이어": "<path d=\"M22 8C11 13 9 23 9 32s2 20 13 24l22-2c10-5 12-15 12-22s-2-19-12-22z\" fill=\"url(#metal)\"/><ellipse cx=\"37\" cy=\"32\" rx=\"14\" ry=\"23\" fill=\"#1c3730\"/><ellipse cx=\"39\" cy=\"32\" rx=\"8\" ry=\"16\" fill=\"#82958b\"/><ellipse cx=\"40\" cy=\"32\" rx=\"5\" ry=\"12\" fill=\"#172c26\"/><path d=\"M17 17l10 4-10 7 11 6-11 7 10 7\" stroke=\"#c3d0c7\" opacity=\".65\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M49 19c4 8 4 19 0 27\" stroke=\"#ef9149\" stroke-width=\"2.5\" fill=\"none\"/>",
  "브레이크 패드": "<path d=\"M12 27l8-14h24l8 14-5 23H17z\" fill=\"url(#body)\"/><path d=\"M18 29h28l-4 15H22z\" fill=\"url(#metal)\"/><path d=\"M17 27h30\" stroke=\"#f09a53\" stroke-width=\"4.2\" stroke-linecap=\"round\"/><path d=\"M25 17v5M40 17v5\" stroke=\"#d7e0d7\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path d=\"M23 33h19\" stroke=\"#fff\" stroke-width=\"2\" opacity=\".4\"/>",
  "구동벨트": "<path d=\"M18 13C10 13 5 23 5 32s5 19 13 19h29c8 0 12-10 12-19S55 13 47 13z\" fill=\"url(#metal)\"/><path d=\"M19 21c-5 0-7 6-7 11s2 11 7 11h26c5 0 7-6 7-11s-2-11-7-11z\" fill=\"#1c3730\"/><path d=\"M17 15v5M25 15v5M33 15v5M41 15v5M49 15v5M17 44v5M25 44v5M33 44v5M41 44v5M49 44v5\" stroke=\"#cbd8cb\" stroke-width=\"2.2\"/><path d=\"M11 25c-3 10 0 19 5 22\" stroke=\"#ee934c\" stroke-width=\"3\" fill=\"none\"/>",
  "에어필터": "<path d=\"M10 21l37-10 8 31-38 11z\" fill=\"url(#body)\"/><path d=\"M17 26l28-8 5 20-28 8z\" fill=\"#ed9149\"/><path d=\"M23 25l4 19M30 23l4 19M37 21l4 19M44 19l4 19\" stroke=\"#ffdaa1\" stroke-width=\"2.2\"/><path d=\"M15 19l32-9\" stroke=\"#f0f4e6\" stroke-width=\"2\" opacity=\".58\"/>",
  "배터리": "<path d=\"M12 21h40v32H12z\" fill=\"url(#body)\"/><path d=\"M18 15h11v6H18zM37 15h10v6H37z\" fill=\"url(#metal)\"/><path d=\"M13 24h38\" stroke=\"#ee9148\" stroke-width=\"4\"/><path d=\"M33 29l-10 14h10l-2 8 13-16h-10l2-6z\" fill=\"#ef9746\"/><path d=\"M18 29v16\" stroke=\"#fff\" stroke-width=\"2\" opacity=\".2\"/>",
  "점화플러그": "<g transform=\"rotate(-35 32 32)\"><path d=\"M26 7h12v9H26z\" fill=\"url(#metal)\"/><path d=\"M24 16h16v11H24z\" fill=\"#e9e5d8\"/><path d=\"M22 27h20v13H22z\" fill=\"url(#metal)\"/><path d=\"M27 40h10v14H27z\" fill=\"url(#metal)\"/><path d=\"M24 43h16M24 48h16M24 53h16\" stroke=\"#263d36\" stroke-width=\"2\"/><path d=\"M30 54v5h11\" stroke=\"#c5cec4\" stroke-width=\"2.2\" fill=\"none\"/><path d=\"M26 22h12\" stroke=\"#ee9147\" stroke-width=\"2.6\"/></g>",
  "냉각수": "<path d=\"M18 21h13v-8h15v8h6v32H12V29z\" fill=\"url(#body)\"/><path d=\"M32 14h14v7H32z\" fill=\"#ed9147\"/><path d=\"M18 23h12v11H18z\" fill=\"#fff\" opacity=\".19\"/><path d=\"M20 39c4-4 7 4 12 0s8-4 12 0M20 46c4-4 7 4 12 0s8-4 12 0\" stroke=\"#f2a15f\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/>",
  "기타": "<g transform=\"rotate(-37 32 32)\"><path d=\"M26 8h11l2 12-4 8v26H28V28l-4-8z\" fill=\"url(#metal)\"/><path d=\"M28 39h8v15h-8z\" fill=\"#ee9450\"/></g><g transform=\"rotate(42 32 32)\"><path d=\"M30 8h5v12l5 6v24H24V26l6-6z\" fill=\"url(#body)\"/><path d=\"M29 42h7v8h-7z\" fill=\"#ee9855\"/></g>"
});
const defs="\n<defs>\n <linearGradient id=\"body\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n <stop stop-color=\"#628274\"/><stop offset=\".43\" stop-color=\"#305345\"/><stop offset=\"1\" stop-color=\"#19362e\"/>\n </linearGradient>\n <linearGradient id=\"metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n <stop stop-color=\"#e2e6de\"/><stop offset=\".34\" stop-color=\"#91a29b\"/><stop offset=\"1\" stop-color=\"#47645b\"/>\n </linearGradient>\n</defs>";
function partName(value){
  if(Object.hasOwn(symbols,value))return value;
  const n=String(value||"").replace(/\s+/g,"").toLowerCase();
  if(/앞.*타이어|프론트.*타이어/.test(n))return "앞 타이어";
  if(/뒤.*타이어|뒷.*타이어|리어.*타이어/.test(n))return "뒤 타이어";
  if(/오일/.test(n))return "엔진오일";
  if(/브레이크|패드/.test(n))return "브레이크 패드";
  if(/벨트|cvt/.test(n))return "구동벨트";
  if(/에어.*필터/.test(n))return "에어필터";
  if(/배터리/.test(n))return "배터리";
  if(/플러그/.test(n))return "점화플러그";
  if(/냉각/.test(n))return "냉각수";
  return "기타";
}
const cache=new Map();
export function maintenanceIcon(name){
  const part=partName(name);
  if(!cache.has(part)){
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">'+defs+symbols[part]+'</svg>';
    cache.set(part,{backgroundImage:'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")',
      backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"});
  }
  return cache.get(part);
}
export const maintenanceIconSources=Object.freeze(Object.fromEntries(
  Object.keys(symbols).map((name,i)=>[name,i])));
