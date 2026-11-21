#!/usr/bin/env python3
"""Add Android 10+ private-origin PNG save to the *extracted* native project.

Does not touch location, back navigation, WebView reload policy, source tarball
or existing on-device records. Applied only during a dedicated APK build.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
java=root/"app/src/main/java/com/riderspot/android/MainActivity.java"
bridge=root/"app/src/main/assets/native-bridge.js"
assert java.is_file() and bridge.is_file(), "Missing expected native source"
source=java.read_text()
js=bridge.read_text()
assert "case \"recap-save\":" not in source, "Save action already present: inspect first"
assert "window.__rsNativeSaveImage" not in js, "Native export already available"
anchor='            case "oauth-open":\n                return openOAuthInBrowser(req.optString("url", ""));'
assert source.count(anchor)==1, "MainActivity action switch changed"
source=source.replace(anchor,anchor+'''
            case "recap-save":
                return saveRecapPng(req);
''',1)
method='''
    // A trusted main-frame WebMessage action; not exposed to external origins.
    // The app owns this new media item, so Android 10+ scoped storage does not
    // require READ_MEDIA_IMAGES or unrestricted filesystem access.
    private JSONObject saveRecapPng(JSONObject req) throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 29) {
            throw new IllegalStateException("이미지 갤러리 저장은 Android 10 이상에서 지원해요.");
        }
        String encoded = req.optString("base64", "");
        if (encoded.isEmpty() || encoded.length() > 9_000_000) {
            throw new IllegalArgumentException("PNG 이미지 용량이 올바르지 않아요.");
        }
        byte[] data = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
        if (data.length < 24 || data.length > 6_000_000
            || (data[0] & 255) != 137 || (data[1] & 255) != 80
            || (data[2] & 255) != 78 || (data[3] & 255) != 71
            || (data[4] & 255) != 13 || (data[5] & 255) != 10
            || (data[6] & 255) != 26 || (data[7] & 255) != 10) {
            throw new IllegalArgumentException("올바른 PNG 이미지가 아니에요.");
        }
        String proposed = req.optString("fileName", "riderspot-ride.png");
        String name = proposed.replaceAll("[^a-zA-Z0-9._-]", "-");
        if (name.isEmpty() || name.length() > 90 || !name.endsWith(".png"))
            name = "riderspot-" + System.currentTimeMillis() + ".png";
        android.content.ContentValues values = new android.content.ContentValues();
        values.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH,
            android.os.Environment.DIRECTORY_PICTURES + "/RiderSpot");
        values.put(android.provider.MediaStore.Images.Media.IS_PENDING, 1);
        android.net.Uri image = getContentResolver().insert(
            android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (image == null) throw new IllegalStateException("갤러리 저장 공간에 접근할 수 없어요.");
        boolean stored = false;
        try {
            try (java.io.OutputStream output = getContentResolver().openOutputStream(image)) {
                if (output == null) throw new java.io.IOException("이미지 파일을 만들 수 없어요.");
                output.write(data);
                output.flush();
            }
            android.content.ContentValues done = new android.content.ContentValues();
            done.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0);
            if (getContentResolver().update(image, done, null, null) <= 0)
                throw new java.io.IOException("갤러리 등록에 실패했어요.");
            stored = true;
        } finally {
            if (!stored) getContentResolver().delete(image, null, null);
        }
        return new JSONObject().put("saved", true).put("fileName", name);
    }

'''
methodAnchor='    private JSONObject processRequest(JSONObject req) throws Exception {'
assert source.count(methodAnchor)==1,"MainActivity request router changed"
source=source.replace(methodAnchor,method+methodAnchor,1)
bridgeAnchor="  window.__rsNativeGpsDiagnostics = () => send('state');"
assert js.count(bridgeAnchor)==1, "Bridge tail changed"
js=js.replace(bridgeAnchor,'''  // Read-only recap image export: write PNG to Pictures/RiderSpot via MediaStore.
  window.__rsNativeSaveImage = (base64, fileName) =>
    send('recap-save', {base64, fileName});
'''+bridgeAnchor,1)
java.write_text(source)
bridge.write_text(js)
assert source.count('case "recap-save":')==1
assert js.count('window.__rsNativeSaveImage')==1
print("RECAP_NATIVE_SAVE_PATCH_PASS",java,bridge)
