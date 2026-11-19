#!/usr/bin/env python3
"""One-time safe WebView shell refresh for Rider Spot Android.

- Never touch native SQLite, WebStorage, cookies, user preferences or auth.
- Only clear the Android HTTP resource cache on app build upgrade.
- On a stale web shell, drop only the app's own named Service Worker caches
  after confirming the native trip database reports no active recording.
"""
from pathlib import Path
import sys

if len(sys.argv)!=2:
    raise SystemExit("usage: weather-native-shell-patch.py EXTRACTED_SOURCE_DIRECTORY")
root=Path(sys.argv[1])
f=root/"app/src/main/java/com/riderspot/android/MainActivity.java"
s=f.read_text()
marker="rs-weather-shell-209"
if marker in s:
    print("Weather native WebView patch already present")
    raise SystemExit(0)

def change(old,new,count=1):
    global s
    actual=s.count(old)
    if actual!=count:
        raise RuntimeError(f"Refusing native patch, expected {count} occurrences, found {actual}: {old[:90]!r}")
    s=s.replace(old,new)

change("    private WebView webView;", """    // rs-weather-shell-209: at most one stale-PWA recovery per Activity.
    private boolean weatherShellReloadAttempted;
    private WebView webView;""")
change("        WebSettings config = webView.getSettings();", """        // Refresh only the HTTP cache once for this app upgrade.
        // Never clear app data, Service Worker storage, cookies or native SQLite.
        if (!getPreferences(MODE_PRIVATE).getBoolean("rs_weather_shell_209", false)) {
            webView.clearCache(true);
            getPreferences(MODE_PRIVATE).edit().putBoolean("rs_weather_shell_209", true).apply();
        }
        WebSettings config = webView.getSettings();""")
change("                onTrustedPageFinished(view, url);", """                onTrustedPageFinished(view, url);
                inspectWeatherShell(view, url);""",2)
change("        webView.loadUrl(HOME);", """        // A distinct navigation URL avoids WebView's old cached root document.
        webView.loadUrl(HOME + "?native_shell=weather209");""")
# Insert recovery before class lifecycle methods. Do not reload during active trips.
place="    private void handleNotificationFinish(Intent intent) {"
method = r'''
    // Detect outdated app UI only after the page is ready. This is deliberately
    // read-only until missing weather UI is confirmed, and never refreshes an
    // active GPS session: all route points remain managed by TrackStore/SQLite.
    private void inspectWeatherShell(WebView view, String url) {
        if (view != webView || weatherShellReloadAttempted || store == null ||
                !store.activeTrip().isEmpty() || !isTrusted(Uri.parse(url))) return;
        handler.postDelayed(() -> {
            if (view != webView || weatherShellReloadAttempted || store == null ||
                    !store.activeTrip().isEmpty()) return;
            view.evaluateJavascript(
                "(function(){return !!document.querySelector('#rs-weather-hud');})()",
                value -> {
                    if (!"false".equals(value) || weatherShellReloadAttempted ||
                            store == null || !store.activeTrip().isEmpty()) return;
                    weatherShellReloadAttempted = true;
                    // Do not delete localStorage, IndexedDB or GPS. Only app
                    // shell HTTP/PWA caches are expired. Offline users are safe.
                    String js = "(async function(){if(!navigator.onLine)return;" +
                        "try{if(navigator.serviceWorker){let rs=await navigator.serviceWorker.getRegistrations();" +
                        "await Promise.all(rs.filter(r=>r.scope.startsWith(location.origin))" +
                        ".map(r=>r.unregister()));}}catch(e){}" +
                        "try{if(window.caches){let ks=await caches.keys();" +
                        "await Promise.all(ks.filter(k=>k.startsWith('rider-spot-shell-'))" +
                        ".map(k=>caches.delete(k)));}}catch(e){}" +
                        "location.replace('/?native_shell=weather209&reload=1');})();";
                    view.evaluateJavascript(js, null);
                });
        }, 2500L);
    }

'''
change(place,method+place)
assert s.count("rs-weather-shell-209") == 1
assert s.count("inspectWeatherShell(view, url)") == 2
assert s.count("webView.clearCache(true)") == 1
assert s.count("store.activeTrip().isEmpty()") >= 2
f.write_text(s)
print("PASS weather-native-shell-209: one-time HTTP refresh + guarded PWA recovery")
