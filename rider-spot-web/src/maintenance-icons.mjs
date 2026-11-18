// Ten image-generated angular maintenance symbols on transparent PNG for the light UI.
// Positions: oil, front/rear tire, brake, belt, filter, battery, spark, coolant, other.
import atlas from "./assets/maintenance/angular-parts-v3.png";
const indexes = Object.freeze({
  "엔진오일":0,"앞 타이어":1,"뒤 타이어":2,"브레이크 패드":3,
  "구동벨트":4,"에어필터":5,"배터리":6,"점화플러그":7,"냉각수":8,"기타":9
});
function indexOfPart(name) {
  if(Object.hasOwn(indexes,name)) return indexes[name];
  const normalized=String(name||"").replace(/\s+/g,"").toLocaleLowerCase("ko-KR");
  if(/앞.*타이어|프론트.*타이어/.test(normalized)) return 1;
  if(/뒤.*타이어|뒷.*타이어|리어.*타이어/.test(normalized)) return 2;
  if(/오일/.test(normalized)) return 0;
  if(/브레이크|패드/.test(normalized)) return 3;
  if(/벨트|cvt/.test(normalized)) return 4;
  if(/에어.*필터/.test(normalized)) return 5;
  if(/배터리/.test(normalized)) return 6;
  if(/플러그/.test(normalized)) return 7;
  if(/냉각/.test(normalized)) return 8;
  return 9;
}
export function maintenanceIcon(name) {
  const index=indexOfPart(name);
  return {
    backgroundImage:`url("${atlas}")`,
    backgroundSize:"500% 200%",
    backgroundPosition:`${(index%5)*25}% ${Math.floor(index/5)*100}%`
  };
}
export const maintenanceIconSources = indexes;
