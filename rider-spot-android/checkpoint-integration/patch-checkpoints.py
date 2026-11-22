#!/usr/bin/env python3
"""Add lightweight periodic trip checkpoints without changing original Android archive."""
from pathlib import Path
import re
import sys

root=Path(sys.argv[1]).resolve()
here=Path(__file__).resolve().parent
app=root/"app"
bridge=app/"src/main/assets/native-bridge.js"
gradle=app/"build.gradle"
activity=app/"src/main/java/com/riderspot/android/MainActivity.java"
assert bridge.is_file() and gradle.is_file() and activity.is_file()
s=bridge.read_text(encoding="utf-8")
assert s.rstrip().endswith("})();"),"Native bridge closure has changed"
assert "window.__rsIncomeNative" in s,"Apply v1.0.14 income integration first"
assert "__rsTripCheckpointCore" not in s,"Already contains checkpoint module"
core=(here/"checkpoint-core.js").read_text(encoding="utf-8")
addon=(here/"native-trip-checkpoint-addon.js").read_text(encoding="utf-8")
s=s.rstrip()[:-5]+"\n"+core+"\n"+addon+"\n})();\n"
assert "window.__rsNativeGpsDiagnostics" in s and "window.__rsIncomeNative" in s
assert "location.reload(" not in s
bridge.write_text(s,encoding="utf-8")
g=gradle.read_text(encoding="utf-8")
g,n=re.subn(r"\bversionCode\s+\d+","versionCode 262",g,count=1)
assert n==1
g,n=re.subn(r"\bversionName\s+['\"][^'\"]+['\"]",
    "versionName '1.0.15-auto-trip-backup'",g,count=1)
assert n==1
gradle.write_text(g,encoding="utf-8")
a=activity.read_text(encoding="utf-8")
assert "webView.loadUrl(HOME)" in a
assert 'getOnBackInvokedDispatcher' in a
print("TRIP_CHECKPOINT_PATCH_PASS · 5-minute incremental server backup, original native bridge intact")
