/* Rider Spot isolated API core (staging only).
 * Server handlers copied verbatim from Cloudflare v220 worker source.
 * Legacy static bundles and unknown paths fall back through the LEGACY_BACKEND
 * service binding to the byte-identical original worker clone.
 * Do not update production until full parity, authenticated, and GPS gates pass.
 */
/* Add these handlers ahead of the ordinary Cloudflare Worker asset router.
 * Google OAuth is always executed in the system browser. The Supabase redirect
 * stays the existing approved first-party Site URL. Only a browser holding a
 * 10-minute, HttpOnly, same-site nonce cookie gets this callback HTML.
 * The HTML reads OAuth tokens from the URL fragment; fragments are never sent
 * to the server. This does not alter ordinary PWA/web Google logins.
 */
const RS_OAUTH_START = '/__rs_android_oauth_start';
const RS_SUPABASE_AUTH = 'https://qkcqzhkvfbymzjdktshp.supabase.co';
const RS_ORIGIN = 'https://rider-spot.jazzhjm.workers.dev';
const RS_COOKIE = 'rs_android_oauth';
const RS_NONCE_RE = /^[0-9a-f]{32}$/;

function rsHttpError(status, message) {
  return new Response(message, {
    status,
    headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}

function rsAuthCallbackHtml(state) {
  // state comes only from a validated server-side cookie. Never embed any
  // sensitive tokens in HTML or a server-visible query string.
  const safeState = JSON.stringify(state);
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>라이더스팟 앱 로그인</title>
<style>body{background:#f5faf8;color:#173c33;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0}.card{max-width:420px;margin:20px;padding:30px;border:1px solid #cce2da;border-radius:22px;background:#fff;text-align:center;line-height:1.8}a{display:block;background:#0a6452;color:white;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:12px;margin-top:20px}small{color:#61786c}</style>
</head><body><main class="card"><h2>라이더스팟 로그인</h2><p id="message">인증을 확인하고 앱으로 돌아갑니다.</p><a id="return" href="#">라이더스팟 앱으로 돌아가기</a><small>앱이 자동으로 열리지 않으면 위 버튼을 눌러주세요.</small></main>
<script>/* No external scripts, no token logging or network requests. */
(function(){
  const state=${safeState};
  const fragment=location.hash || '';
  const params=new URLSearchParams(fragment.slice(1));
  const callback='riderspot-oauth://signin/callback?state='+encodeURIComponent(state)+fragment;
  const button=document.getElementById('return');
  const msg=document.getElementById('message');
  if(!params.has('access_token')&&!params.has('error')&&!params.has('error_code')){
    msg.textContent='로그인 인증 정보가 도착하지 않았어요. 라이더스팟 앱에서 다시 로그인해 주세요.';
    button.style.display='none';
    return;
  }
  button.href=callback;
  window.setTimeout(()=>{window.location.replace(callback)},120);
})();
</script></body></html>`;
}

async function handleRiderSpotOAuth(request, url) {
  if (url.pathname === RS_OAUTH_START) {
    if (request.method !== 'GET') return rsHttpError(405,'Method Not Allowed');
    const state=url.searchParams.get('state') || '';
    const target=url.searchParams.get('target') || '';
    if (!RS_NONCE_RE.test(state) || target.length > 4096) return rsHttpError(400,'Invalid Android login request');
    let auth;
    try { auth=new URL(target); } catch { return rsHttpError(400,'Invalid OAuth URL'); }
    if (auth.origin !== RS_SUPABASE_AUTH || auth.pathname !== '/auth/v1/authorize'
      || auth.searchParams.get('provider') !== 'google'
      || auth.searchParams.get('redirect_to') !== RS_ORIGIN + '/') {
      return rsHttpError(400,'Unsupported OAuth destination');
    }
    return new Response(null,{
      status:302,
      headers:{
        'Location':auth.toString(),
        'Set-Cookie':RS_COOKIE+'='+state+'; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax',
        'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'
      }
    });
  }
  if (url.pathname === '/' && request.method === 'GET') {
    const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim())
      .find(x=>x.startsWith(RS_COOKIE+'='));
    const state=cookie?cookie.substring((RS_COOKIE+'=').length):'';
    if (!RS_NONCE_RE.test(state)) return null; // Ordinary browsers are unchanged.
    return new Response(rsAuthCallbackHtml(state),{
      status:200,
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store',
        'Set-Cookie':RS_COOKIE+'=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax',
        'Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff',
        'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
      }
    });
  }
  return null;
}

// User-initiated display-only road matching. The GPS coordinates are not stored.
async function riderSpotMatchRoads(request, url) {
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const respond=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers});
 if(request.method!=='POST')return respond({message:'POST only'},405);
 const origin=request.headers.get('Origin');
 if(origin&&origin!==url.origin)return respond({message:'Origin not allowed'},403);
 const length=Number(request.headers.get('Content-Length')||0);
 if(length>16000)return respond({message:'Too many coordinates'},413);
 let body;
 try{const str=await request.text();if(str.length>16000)return respond({message:'Too many coordinates'},413);body=JSON.parse(str)}catch{return respond({message:'Invalid JSON'},400)}
 const points=body?.points;
 if(!Array.isArray(points)||points.length<4||points.length>70)return respond({message:'GPS points must be 4 to 70'},400);
 const valid=points.every(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180);
 if(!valid)return respond({message:'Invalid coordinates'},400);
 const pairs=points.map(p=>Number(p.lng).toFixed(6)+','+Number(p.lat).toFixed(6)).join(';');
 let ts=points.map(p=>Number(p.time));
 const okTimes=ts.every((n,i)=>Number.isFinite(n)&&n>1e12&&(i===0||n>ts[i-1]));
 const timestampParam=okTimes?'&timestamps='+ts.map(t=>Math.round(t/1000)).join(';'):'';
 const upstream='https://router.project-osrm.org/match/v1/driving/'+pairs+'?geometries=geojson&overview=full&steps=false&tidy=true&gaps=split'+timestampParam;
 try{
  const ext=await fetch(upstream,{headers:{'Accept':'application/json','X-Client-Id':'riderspot-community-prototype'},signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!ext.ok)return respond({message:'External road matching server unavailable'},502);
  const result=await ext.json();
  if(result?.code!=='Ok')return respond({lines:[],message:'No road match'});
  const lines=[];
  for(const match of result.matchings||[]){
   const coords=match.geometry?.coordinates;
   if(Number(match.confidence)<0.5||!Array.isArray(coords)||coords.length>6000)continue;
   const line=coords.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))
       .map(p=>({lat:p[1],lng:p[0]}));
   if(line.length>=2)lines.push(line);
  }
  return respond({lines,matched:lines.length,source:'OSRM demo · estimate'});
 }catch{return respond({message:'External road matching timed out'},503)}
}

;
async function getIndustryNews(request){
const topics={"전체":"(\"배달 라이더\" OR \"배달 플랫폼\" OR \"배민\" OR \"쿠팡이츠\") when:14d","플랫폼":"(\"배달의민족\" OR \"쿠팡이츠\" OR \"배달 플랫폼\") when:14d","정책·제도":"(\"배달 라이더\" OR \"배달 노동자\") (보험 OR 수수료 OR 정책 OR 법) when:30d","안전":"(\"배달 라이더\" OR \"배달 오토바이\") (안전 OR 사고 OR 보호) when:30d"};
const topic=new URL(request.url).searchParams.get("topic")||"전체";
const url="https://news.google.com/rss/search?q="+encodeURIComponent(topics[topic]||topics["전체"])+"&hl=ko&gl=KR&ceid=KR:ko";
const decode=v=>String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g,"").replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(_m,c)=>{const x=c.toLowerCase();if(x[0]==="#"){const n=x[1]==="x"?parseInt(x.slice(2),16):parseInt(x.slice(1),10);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):"";}return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "}[x]||"";}).trim();
const read=(body,tag)=>{const m=body.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"));return m?decode(m[1]):"";};
try{
const r=await fetch(url,{headers:{Accept:"application/rss+xml,application/xml,text/xml"}});
if(!r.ok)throw Error("news upstream "+r.status);
const xml=await r.text();
const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,24).map(m=>{
 const body=m[1],title=read(body,"title"),link=read(body,"link"),source=read(body,"source"),published_at=read(body,"pubDate");
 if(!title||!/^https:\/\/news\.google\.com\//i.test(link))return null;
 return {title:source&&title.endsWith(" - "+source)?title.slice(0,-source.length-3):title,link,source:source||"Google 뉴스",published_at};
}).filter(Boolean).slice(0,20);
return new Response(JSON.stringify({items}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public,max-age=240","X-Content-Type-Options":"nosniff"}});
}catch(e){return new Response(JSON.stringify({items:[],message:"뉴스 제공처에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."}),{status:502,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
}



const RS_WEATHER_ORIGIN = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const RS_WEATHER_USER_AGENT = "RiderSpot/1.0 (https://rider-spot.jazzhjm.workers.dev)";
function rsWeatherNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function rsWeatherPoint(value) {
  const n = rsWeatherNumber(value);
  if (n === null) return null;
  return (Math.round(n * 20) / 20).toFixed(2); // About 5km cells. Cache and privacy friendly.
}
function rsNormalizeWeather(payload, now = Date.now()) {
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
async function rsHandleWeather(request) {
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


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/weather') return rsHandleWeather(request);
    if (url.pathname === '/api/route-match') return riderSpotMatchRoads(request, url);
    const auth = await handleRiderSpotOAuth(request, url);
    if (auth) return auth;
    if (url.pathname === '/api/industry-news') return getIndustryNews(request);
    // Map data, historical JS/CSS, SVG/image assets, PWA files and other
    // unsupported paths remain with the frozen legacy backend.
    return env.LEGACY_BACKEND.fetch(request);
  }
};
