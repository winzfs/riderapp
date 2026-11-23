#!/usr/bin/env python3
"""Add Android 10+ scoped Downloads/RiderSpot GPS JSON backup saving.
Only the extracted Android build directory is patched. SQLite and GPS capture stay untouched.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
activity = root / "app/src/main/java/com/riderspot/android/MainActivity.java"
bridge = root / "app/src/main/assets/native-bridge.js"
gradle = root / "app/build.gradle"
assert activity.is_file() and bridge.is_file() and gradle.is_file()
java = activity.read_text(encoding="utf-8")
js = bridge.read_text(encoding="utf-8")
assert 'case "gps-backup-save":' not in java
assert "window.__rsNativeSaveGpsBackup" not in js
anchor = '            case "recap-save":\n                return saveRecapPng(req);'
assert java.count(anchor) == 1, "Expected prior PNG patch in MainActivity"
java = java.replace(anchor, anchor + '''
            case "gps-backup-save":
                return saveGpsBackupJson(req);''', 1)

method_anchor = "    private JSONObject processRequest(JSONObject req) throws Exception {"
assert java.count(method_anchor) == 1
method = '''
    // GPS coordinates never leave this device for this action.
    // Save to Downloads/RiderSpot with the scoped-storage MediaStore API.
    private JSONObject saveGpsBackupJson(JSONObject req) throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 29)
            throw new IllegalStateException("GPS 백업 저장은 Android 10 이상에서 지원해요.");
        String encoded = req.optString("base64", "");
        if (encoded.isEmpty() || encoded.length() > 11_000_000)
            throw new IllegalArgumentException("백업 파일 용량이 너무 커요.");
        byte[] data = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
        if (data.length < 80 || data.length > 7_500_000)
            throw new IllegalArgumentException("GPS 백업 크기가 올바르지 않아요.");
        JSONObject payload = new JSONObject(
            new String(data, java.nio.charset.StandardCharsets.UTF_8));
        if (!"riderspot-gps-backup-v1".equals(payload.optString("format")))
            throw new IllegalArgumentException("RiderSpot 백업 형식이 아니에요.");
        org.json.JSONArray entries = payload.optJSONArray("entries");
        if (entries == null || entries.length() == 0 || entries.length() > 100)
            throw new IllegalArgumentException("백업할 운행 기록을 확인해 주세요.");
        for (int i = 0; i < entries.length(); i++) {
            JSONObject item = entries.getJSONObject(i);
            String tripId = item.optString("trip_id", "");
            if (!tripId.matches("[0-9a-fA-F-]{36}"))
                throw new IllegalArgumentException("운행 식별자가 올바르지 않아요.");
            org.json.JSONArray points = item.optJSONArray("points");
            if (points == null || points.length() < 1)
                throw new IllegalArgumentException("GPS 좌표가 없는 백업은 저장하지 않아요.");
        }
        String proposed = req.optString("fileName", "RiderSpot-GPS.json");
        String name = proposed.replaceAll("[^a-zA-Z0-9._-]", "-");
        if (name.isEmpty() || name.length() > 90 || !name.endsWith(".json"))
            name = "RiderSpot-GPS-" + System.currentTimeMillis() + ".json";
        android.content.ContentValues values = new android.content.ContentValues();
        values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/json");
        values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
            android.os.Environment.DIRECTORY_DOWNLOADS + "/RiderSpot");
        values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);
        android.net.Uri location = getContentResolver().insert(
            android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (location == null)
            throw new java.io.IOException("다운로드 폴더에 파일을 만들지 못했어요.");
        boolean completed = false;
        try {
            try (java.io.OutputStream out = getContentResolver().openOutputStream(location)) {
                if (out == null) throw new java.io.IOException("백업 파일 쓰기가 실패했어요.");
                out.write(data);
                out.flush();
            }
            android.content.ContentValues published = new android.content.ContentValues();
            published.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
            if (getContentResolver().update(location, published, null, null) <= 0)
                throw new java.io.IOException("백업 파일 등록에 실패했어요.");
            completed = true;
        } finally {
            if (!completed) getContentResolver().delete(location, null, null);
        }
        return new JSONObject().put("saved", true)
            .put("fileName", name).put("bytes", data.length);
    }

'''
java = java.replace(method_anchor, method + method_anchor, 1)
bridge_anchor = "  window.__rsNativeGpsDiagnostics = () => send('state');"
assert js.count(bridge_anchor) == 1
js = js.replace(bridge_anchor,
    '''  // Private GPS backup is written to Downloads/RiderSpot on this phone.
  window.__rsNativeSaveGpsBackup = (base64, fileName) =>
    send('gps-backup-save', {base64, fileName});
''' + bridge_anchor, 1)
activity.write_text(java, encoding="utf-8")
bridge.write_text(js, encoding="utf-8")
build = gradle.read_text(encoding="utf-8")
assert "versionCode 262" in build and "versionName '1.0.15-auto-trip-backup'" in build
build = build.replace("versionCode 262", "versionCode 263", 1)
build = build.replace("versionName '1.0.15-auto-trip-backup'",
                      "versionName '1.0.16-local-gps-backup'", 1)
gradle.write_text(build, encoding="utf-8")
assert java.count('case "gps-backup-save":') == 1
assert "location.reload(" not in js
print("PASS: Android JSON GPS save via MediaStore.Downloads; native SQLite unchanged")
