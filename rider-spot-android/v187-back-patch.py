#!/usr/bin/env python3
"""Rider Spot Android v187: route hardware Back through the web navigation stack.
All GPS storage, FusedLocation service, OAuth and notification code remains unchanged.
"""
from pathlib import Path
import re
import sys

root=Path(sys.argv[1]).resolve()
activity=root/"app/src/main/java/com/riderspot/android/MainActivity.java"
content=activity.read_text()
old="""    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
"""
new="""    // The SPA owns the ordered Back stack (sheet -> detail -> tab -> home).
    // canGoBack() alone ignores UI state and used to finish the Activity too early.
    @Override public void onBackPressed() {
        if (webView == null) { confirmExitFromBack(); return; }
        webView.evaluateJavascript(
            "(function(){try{if(typeof window.__rsHandleBack==='function'){return window.__rsHandleBack()?'handled':'exit';}}catch(e){}return 'fallback';})()",
            result -> {
                if ("\\\"handled\\\"".equals(result)) return;
                if ("\\\"exit\\\"".equals(result)) { confirmExitFromBack(); return; }
                if (webView != null && webView.canGoBack()) webView.goBack();
                else confirmExitFromBack();
            });
    }

    private void confirmExitFromBack() {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle("라이더스팟 종료")
            .setMessage("앱을 종료할까요?")
            .setNegativeButton("계속 사용", (dialog, which) -> dialog.dismiss())
            .setPositiveButton("종료", (dialog, which) -> finish())
            .show();
    }
"""
assert content.count(old)==1, "Native onBackPressed has drifted; review rather than patch by guessing"
content=content.replace(old,new)
assert "window.__rsHandleBack" in content and "confirmExitFromBack" in content
assert content.count("class MainActivity") == 1
activity.write_text(content)
# Version bump only; no changes to native GPS storage or authentication flows.
gradle=root/"app/build.gradle"
if gradle.exists():
    g=gradle.read_text()
    if re.search(r"versionCode\\s+\\d+",g):
        g=re.sub(r"versionCode\\s+\\d+",lambda m:"versionCode "+str(int(m.group().split()[-1])+1),g,count=1)
    if re.search(r"versionName\\s+['\"][^'\"]+['\"]",g):
        g=re.sub(r"versionName\\s+['\"][^'\"]+['\"]","versionName '1.0.8-v187-back'",g,count=1)
    gradle.write_text(g)
print("PASS v187 native Back delegation; existing GPS and OAuth untouched")
