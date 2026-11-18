import oil from "./assets/maintenance/engine-oil.svg";
import front from "./assets/maintenance/front-tire.svg";
import rear from "./assets/maintenance/rear-tire.svg";
import brake from "./assets/maintenance/brake-pad.svg";
import belt from "./assets/maintenance/drive-belt.svg";
import filter from "./assets/maintenance/air-filter.svg";
import battery from "./assets/maintenance/battery.svg";
import spark from "./assets/maintenance/spark-plug.svg";
import coolant from "./assets/maintenance/coolant.svg";
import other from "./assets/maintenance/other.svg";

const sources = {
  "엔진오일":oil, "앞 타이어":front, "뒤 타이어":rear,
  "브레이크 패드":brake, "구동벨트":belt, "에어필터":filter,
  "배터리":battery, "점화플러그":spark, "냉각수":coolant,
};
export function maintenanceIcon(name) {
  const part = String(name || "").replace(/\s+/g, "");
  if (sources[name]) return sources[name];
  if (/앞.*타이어|프론트.*타이어/.test(part)) return front;
  if (/뒤.*타이어|뒷.*타이어|리어.*타이어/.test(part)) return rear;
  if (/오일/.test(part)) return oil;
  if (/브레이크|패드/.test(part)) return brake;
  if (/벨트|CVT/.test(part)) return belt;
  if (/에어.*필터/.test(part)) return filter;
  if (/배터리/.test(part)) return battery;
  if (/플러그/.test(part)) return spark;
  if (/냉각/.test(part)) return coolant;
  return other;
}
export const maintenanceIconSources = sources;
