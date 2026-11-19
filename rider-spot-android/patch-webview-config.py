#!/usr/bin/env python3
"""Keep the existing WebView document alive across Android multi-window changes."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
manifest = root / "app/src/main/AndroidManifest.xml"
original = manifest.read_text(encoding="utf-8")
old = 'android:configChanges="orientation|screenSize|keyboardHidden"'
new = ('android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|'
       'keyboardHidden|keyboard|uiMode|density|fontScale|layoutDirection"')
if original.count(old) != 1:
    raise SystemExit("Unexpected manifest configChanges: refuse to patch")
manifest.write_text(original.replace(old, new), encoding="utf-8")

activity = (root / "app/src/main/java/com/riderspot/android/MainActivity.java").read_text(encoding="utf-8")
assert activity.count("webView.loadUrl(HOME);") == 1
resume = activity.split("@Override protected void onResume()", 1)[1].split(
    "@Override protected void onPause()", 1)[0]
assert "webView.loadUrl(" not in resume and "webView.reload(" not in resume

gradle = root / "app/build.gradle"
if gradle.is_file():
    body = gradle.read_text(encoding="utf-8")
    body, count = re.subn(r"\bversionCode\s+(\d+)",
                          lambda m: "versionCode " + str(int(m.group(1)) + 1),
                          body, count=1)
    assert count == 1, "Native versionCode not found"
    body, count = re.subn(r"\bversionName\s+['\"][^'\"]+['\"]",
                          "versionName '1.0.9-webview-config-guard'", body, count=1)
    assert count == 1, "Native versionName not found"
    gradle.write_text(body, encoding="utf-8")

assert "smallestScreenSize|screenLayout" in manifest.read_text(encoding="utf-8")
print("PASS: multi-window, rotation, display-density and UI-mode changes preserve MainActivity/WebView")
