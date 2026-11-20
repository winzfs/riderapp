/**
 * Read-only Android WebView DOM acceptance for the separately installed
 * Rider Spot migration QA APK. Requires the QA APK's WebView debugging flag
 * and adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>.
 * Does not work against or enable debugging in the shipping Android package.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const phase = process.argv[2] || "first-launch";
const root = "/tmp/rider-spot-emulator-evidence";
mkdirSync(root, { recursive: true });
const expectedHost = "rider-spot-static-preview.jazzhjm.workers.dev";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluation = `(() => ({
  host: location.hostname,
  title: document.title,
  ready: document.readyState,
  tabs: document.querySelectorAll(".bottom-nav button").length,
  tabLabels: [...document.querySelectorAll(".bottom-nav button")].map(b => b.textContent.trim()),
  hasMap: !!document.querySelector(".leaflet-container"),
  hasStart: (document.body?.innerText || "").includes("운행 시작"),
  hasError: /Webpage not available|ERR_INTERNET_DISCONNECTED/.test(document.body?.innerText || "")
}))()`;

function evaluate(wsUrl) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const ws = new WebSocket(wsUrl.replace("localhost", "127.0.0.1"));
    const timeout = setTimeout(() => done(new Error("CDP evaluate timeout")), 10000);
    function done(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      if (error) reject(error);
      else resolve(result);
    }
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        id: 47, method: "Runtime.evaluate",
        params: { expression: evaluation, returnByValue: true },
      }));
    });
    ws.addEventListener("message", event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id !== 47) return;
        if (msg.error || msg.result?.exceptionDetails) return done(new Error(JSON.stringify(msg.error || msg.result.exceptionDetails)));
        done(null, msg.result?.result?.value || {});
      } catch (error) { done(error); }
    });
    ws.addEventListener("error", () => done(new Error("CDP WebSocket error")));
  });
}

let lastError = "";
let lastState = null;
const started = Date.now();
while (Date.now() - started < 24000) {
  try {
    const res = await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(4000) });
    const targets = await res.json();
    const page = targets.find(t => t.type === "page" && t.url?.includes(expectedHost) && t.webSocketDebuggerUrl);
    if (!page) {
      lastError = "Expected staging WebView not present: " + JSON.stringify(targets.map(t => ({ type: t.type, url: t.url, title: t.title })));
    } else {
      const state = await evaluate(page.webSocketDebuggerUrl);
      lastState = state;
      if (state.host === expectedHost && state.tabs === 5 && state.hasStart && !state.hasError) {
        writeFileSync(`${root}/${phase}-cdp.json`, JSON.stringify({ passed: true, state }, null, 2));
        console.log("PASS staging WebView CDP DOM", phase, JSON.stringify(state));
        process.exit(0);
      }
      lastError = "Page loaded but expected native app navigation not ready";
    }
  } catch (error) { lastError = String(error); }
  await sleep(1400);
}
writeFileSync(`${root}/${phase}-cdp.json`, JSON.stringify({ passed: false, lastError, lastState }, null, 2));
console.error("FAIL staging WebView DOM was not verified:", lastError, JSON.stringify(lastState));
process.exit(1);
