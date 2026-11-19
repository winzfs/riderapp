/*
 * Rider Spot staged static-assets edge. Do not deploy this over rider-spot
 * until the old script has been cloned to a separate, verified backend Worker.
 *
 * ASSETS serves the newly built hashed UI and map data directly. The legacy
 * Worker remains responsible for APIs, OAuth, and old URLs via a service binding.
 */
const BACKEND_ORIGIN = "https://rider-spot.jazzhjm.workers.dev";
const GUARD = /<script\s+id=["']rs-recovery-guard-v217["'][^>]*>[\s\S]*?<\/script>/i;

export function backendRequest(request) {
  const source = new URL(request.url);
  const destination = new URL(BACKEND_ORIGIN);
  destination.pathname = source.pathname;
  destination.search = source.search;
  return new Request(destination, request);
}

function failClosed(message) {
  return new Response(message, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function serveShell(request, env) {
  // Both reads are static: never forward the visitor's credentials to obtain
  // the production-only native recovery guard.
  const localUrl = new URL("/index.html", request.url);
  const [asset, legacy] = await Promise.all([
    env.ASSETS.fetch(new Request(localUrl, { method: "GET" })),
    env.LEGACY.fetch(new Request(BACKEND_ORIGIN + "/", {
      method: "GET", headers: { accept: "text/html" },
    })),
  ]);
  if (!asset.ok || !legacy.ok) return failClosed("Migration preview shell unavailable");
  const [html, source] = await Promise.all([asset.text(), legacy.text()]);
  const guard = source.match(GUARD)?.[0];
  if (!guard || !html.includes("</head>")) {
    return failClosed("Native recovery guard missing from migration preview");
  }
  const output = GUARD.test(html) ? html : html.replace("</head>", guard + "</head>");
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  return new Response(request.method === "HEAD" ? null : output, {
    status: 200, headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    // This is an intentionally isolated service-name. Production remains
    // unchanged; never bind LEGACY to itself in the eventual cutover.
    if ((request.method === "GET" || request.method === "HEAD")
        && (path === "/" || path === "/index.html")) {
      return serveShell(request, env);
    }
    if ((request.method === "GET" || request.method === "HEAD") && path === "/sw.js") {
      const response = await env.ASSETS.fetch(request);
      if (!response.ok) return failClosed("Service Worker candidate missing");
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-cache, must-revalidate");
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status, headers,
      });
    }
    // Real Static Assets serves matches directly. The manually staged preview
    // uses an asset service binding instead, so it must explicitly dispatch
    // newly hashed paths here. Older hashed URLs fall back to the legacy Worker.
    if ((request.method === "GET" || request.method === "HEAD")
        && (/^\\/assets\\/rider-spot-[0-9a-f]{12}\\//.test(path)
          || /^\\/mapdata\\//.test(path))) {
      const candidate = await env.ASSETS.fetch(request);
      if (candidate.status !== 404) return candidate;
    }
    // Other paths, including historic JS/CSS, API and OAuth, stay untouched.
    return env.LEGACY.fetch(backendRequest(request));
  },
};
