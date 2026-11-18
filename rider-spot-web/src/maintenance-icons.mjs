// v196: independently scaled vector icons, sharp on high-density Android screens.
import engine from "./assets/maintenance/engine-oil.svg";
import front from "./assets/maintenance/front-tire.svg";
import rear from "./assets/maintenance/rear-tire.svg";
import brakes from "./assets/maintenance/brake-pad.svg";
import belt from "./assets/maintenance/drive-belt.svg";
import filter from "./assets/maintenance/air-filter.svg";
import battery from "./assets/maintenance/battery.svg";
import plug from "./assets/maintenance/spark-plug.svg";
import coolant from "./assets/maintenance/coolant.svg";
import other from "./assets/maintenance/other.svg";

const assets=Object.freeze({
  "엔진오일":engine,"앞 타이어":front,"뒤 타이어":rear,
  "브레이크 패드":brakes,"구동벨트":belt,"에어필터":filter,
  "배터리":battery,"점화플러그":plug,"냉각수":coolant,"기타":other
});
export const maintenanceIconSources=Object.freeze(Object.keys(assets));
function partName(value){
  if(Object.hasOwn(assets,value))return value;
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
    cache.set(part,Object.freeze({
      backgroundImage:'url("'+assets[part]+'")',
      backgroundSize:"contain",
      backgroundPosition:"center",
      backgroundRepeat:"no-repeat"
    }));
  }
  return cache.get(part);
}
