// Rider Spot v197: the original Neo-Flat artwork, not the later SVG redraw.
// Original transparent source: 1983x793; this embedded WebP: 1280x512.
// Each of ten tiles is 256x256 physical pixels (>4x the former 50px sprite).
import atlas from "./assets/maintenance/neo-flat-original-v197.webp";

const slots=Object.freeze({
  "엔진오일":[0,0],"앞 타이어":[1,0],"뒤 타이어":[2,0],
  "브레이크 패드":[3,0],"구동벨트":[4,0],
  "에어필터":[0,1],"배터리":[1,1],"점화플러그":[2,1],
  "냉각수":[3,1],"기타":[4,1]
});
export const maintenanceIconSources=Object.freeze(Object.keys(slots));
function partName(value){
  if(Object.hasOwn(slots,value))return value;
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
    const [column,row]=slots[part];
    cache.set(part,Object.freeze({
      backgroundImage:'url("'+atlas+'")',
      backgroundSize:"500% 200%",
      backgroundPosition:(column*25)+"% "+(row*100)+"%",
      backgroundRepeat:"no-repeat"
    }));
  }
  return cache.get(part);
}
