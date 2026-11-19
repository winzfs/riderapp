// Rider Spot weather endpoint. MET Norway CC BY 4.0; non-commercial and commercial use allowed with attribution.
// The Worker is the only upstream caller; raw GPS coordinates are never forwarded.
const RS_WEATHER_ORIGIN = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const RS_WEATHER_USER_AGENT = "RiderSpot/1.0 (https://rider-spot.jazzhjm.workers.dev)";
function rsWeatherNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function rsWeatherPoint(value) {
  const n = rsWeatherNumber(value);
  if (n === null) return null;
  return (Math.round(n * 20) / 20).toFixed(2); // About 5km cells. Cache and privacy friendly.
}
export function rsNormalizeWeather(payload, now = Date.now()) {
  const rows = payload?.properties?.timeseries;
  if (!Array.isArray(rows) || !rows.length) throw Error("Weather forecast missing");
  const hourly = rows.filter(row => {
    const t = Date.parse(row?.time || "");
    return Number.isFinite(t) && t >= now - 65 * 60000 && t <= now + 7 * 3600000;
  }).slice(0, 8);
  if (!hourly.length) throw Error("Forecast is stale");
  const toHour = (row) => {
    const info = row.data?.instant?.details || {};
    const next = row.data?.next_1_hours || {};
    return {
      time: row.time,
      temp: rsWeatherNumber(info.air_temperature),
      humidity: rsWeatherNumber(info.relative_humidity),
      wind: rsWeatherNumber(info.wind_speed),
      precipMm: rsWeatherNumber(next.details?.precipitation_amount),
      symbol: String(next.summary?.symbol_code || row.data?.next_6_hours?.summary?.symbol_code || "unknown").slice(0, 50)
    };
  };
  const hours = hourly.map(toHour);
  return {
    source: "MET Norway",
    attribution: "Norwegian Meteorological Institute · CC BY 4.0",
    updatedAt: payload.properties.meta?.updated_at || null,
    receivedAt: new Date(now).toISOString(),
    current: hours[0],
    hours: hours.slice(0, 7)
  };
}
export async function rsHandleWeather(request) {
  if (request.method !== "GET") return new Response("Method not allowed", {status:405});
  const url = new URL(request.url);
  const latitude = rsWeatherNumber(url.searchParams.get("lat"));
  const longitude = rsWeatherNumber(url.searchParams.get("lon"));
  if (latitude === null || longitude === null || latitude < 32 || latitude > 40 || longitude < 124 || longitude > 132)
    return new Response(JSON.stringify({error:"유효한 국내 위치가 필요합니다."}), {status:400, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  const lat = rsWeatherPoint(latitude), lon = rsWeatherPoint(longitude);
  const key = new Request(url.origin + "/api/weather?lat=" + lat + "&lon=" + lon);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache ? await cache.match(key) : null;
  if (hit) return hit;
  const remote = RS_WEATHER_ORIGIN + "?lat=" + lat + "&lon=" + lon;
  let result;
  try {
    const res = await fetch(remote, {headers:{"User-Agent":RS_WEATHER_USER_AGENT,"Accept":"application/json"}, signal:AbortSignal.timeout(9500)});
    if (!res.ok) throw Error("upstream:" + res.status);
    result = rsNormalizeWeather(await res.json());
  } catch {
    return new Response(JSON.stringify({error:"현재 날씨를 불러오지 못했습니다."}), {status:503,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }
  const response = new Response(JSON.stringify(result), {status:200,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"public, max-age=1800",
    "X-Content-Type-Options":"nosniff"
  }});
  if (cache) await cache.put(key, response.clone()).catch(()=>{});
  return response;
}
