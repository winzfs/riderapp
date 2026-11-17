#!/usr/bin/env python3
"""v62 insets regression repair. Apply only to the unpacked native source tree."""
from pathlib import Path

root=Path(__file__).resolve().parent
activity=root/"app/src/main/java/com/riderspot/android/MainActivity.java"
text=activity.read_text()
old="""        webView = new WebView(this);
        webView.setBackgroundColor(0xffFFFFFF);
        // Android 15+ draws behind the status bar by default. Keep the app header readable.
        if (Build.VERSION.SDK_INT >= 35) {
            webView.setOnApplyWindowInsetsListener((v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return windowInsets;
            });
        }
        setContentView(webView);
"""
new="""        webView = new WebView(this);
        webView.setBackgroundColor(0xffFFFFFF);
        // WebView.setPadding does NOT reliably constrain WebContents under
        // Android 15/16 enforced edge-to-edge. Let an actual layout parent own
        // system bar insets so WebView occupies only the safe content rectangle.
        FrameLayout safeRoot = new FrameLayout(this);
        safeRoot.setBackgroundColor(0xffFFFFFF);
        safeRoot.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 35) {
            safeRoot.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        setContentView(safeRoot);
        if (Build.VERSION.SDK_INT >= 35) safeRoot.requestApplyInsets();
"""
assert text.count(old)==1, "Unexpected MainActivity; manual review required"
text=text.replace(old,new)
assert text.count("import android.view.WindowInsets;")==1
text=text.replace("import android.view.WindowInsets;", "import android.view.WindowInsets;\nimport android.widget.FrameLayout;")
activity.write_text(text)
gradle=root/"app/build.gradle"
text=gradle.read_text()
assert "versionCode 7" in text and "versionName '1.0.6-beta7'" in text
gradle.write_text(text.replace("versionCode 7","versionCode 8").replace("versionName '1.0.6-beta7'","versionName '1.0.7-v62-insets'"))
assert "webView.setOnApplyWindowInsetsListener" not in activity.read_text()
assert "setContentView(safeRoot)" in activity.read_text()
print("PATCH PASS: native safe layout parent owns system window insets")
