#!/usr/bin/env python3
"""v60: reliably save RiderSpot account JSON via the *existing* trusted Android
WebView bridge using scoped MediaStore Downloads/RiderSpot. Additive only:
GPS archive, legacy JSON GPS backup, earnings, and WebView UI remain unchanged.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
activity=root/"app/src/main/java/com/riderspot/android/MainActivity.java"
bridge=root/"app/src/main/assets/native-bridge.js"
gradle=root/"app/build.gradle"
assert activity.is_file() and bridge.is_file() and gradle.is_file()

s=activity.read_text()
marker='            case "gps-backup-save":\n                return saveGpsBackupJson(req);'
assert s.count(marker)==1, "Existing scoped MediaStore GPS path not found"
s=s.replace(marker,marker+'''
            case "account-backup-save":
                return saveAccountBackupJsonV60(req);''',1)

method_anchor="    private JSONObject processRequest(JSONObject req) throws Exception {"
assert s.count(method_anchor)==1
method=r'''
    /** v60 account-only backup: never mutates server records or native GPS. */
    private JSONObject saveAccountBackupJsonV60(JSONObject req) throws Exception {
        if(android.os.Build.VERSION.SDK_INT < 29)
            throw new IllegalStateException("Android 10 이상에서 계정 파일 백업을 지원해요.");
        String encoded=req.optString("base64","");
        if(encoded.isEmpty() || encoded.length()>10_500_000)
            throw new IllegalArgumentException("백업 파일 용량을 확인해 주세요.");
        byte[] bytes;
        try{bytes=android.util.Base64.decode(encoded,android.util.Base64.DEFAULT);}
        catch(IllegalArgumentException e){
            throw new IllegalArgumentException("백업 데이터가 손상됐어요.",e);
        }
        if(bytes.length<90 || bytes.length>7_400_000)
            throw new IllegalArgumentException("계정 백업 크기가 올바르지 않아요.");
        JSONObject backup=new JSONObject(
            new String(bytes,java.nio.charset.StandardCharsets.UTF_8));
        if(!"riderspot-account-backup-v52".equals(backup.optString("format")) ||
           !backup.optString("account_id","").matches(
               "(?i)[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}") ||
           backup.optJSONObject("tables")==null ||
           backup.optJSONArray("legacy_gps")==null)
            throw new IllegalArgumentException("라이더스팟 계정 백업 형식이 아니에요.");
        String requested=req.optString("fileName","");
        if(!requested.matches("RiderSpot-Account-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.json"))
            requested="RiderSpot-Account-"+java.time.LocalDate.now()+".json";
        // Multiple backups on the same day MUST NOT silently overwrite one another.
        String filename=requested.replace(".json",
            "-"+System.currentTimeMillis()+".json");
        android.content.ContentResolver resolver=getContentResolver();
        android.content.ContentValues values=new android.content.ContentValues();
        values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,filename);
        values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"application/json");
        values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
            android.os.Environment.DIRECTORY_DOWNLOADS+"/RiderSpot");
        values.put(android.provider.MediaStore.MediaColumns.IS_PENDING,1);
        android.net.Uri location=resolver.insert(
            android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
        if(location==null)
            throw new java.io.IOException("다운로드 폴더에 파일을 만들지 못했어요.");
        boolean published=false;
        try {
            try(java.io.OutputStream out=resolver.openOutputStream(location,"w")){
                if(out==null)throw new java.io.IOException("백업 파일을 쓸 수 없어요.");
                out.write(bytes);
                out.flush();
            }
            byte[] expected=java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
            java.security.MessageDigest check=java.security.MessageDigest.getInstance("SHA-256");
            long count=0;
            try(java.io.InputStream in=resolver.openInputStream(location)){
                if(in==null)throw new java.io.IOException("백업 파일을 다시 읽을 수 없어요.");
                byte[] buffer=new byte[8192];
                int n;
                while((n=in.read(buffer))!=-1){
                    check.update(buffer,0,n);
                    count+=n;
                }
            }
            if(count!=bytes.length ||
               !java.security.MessageDigest.isEqual(expected,check.digest()))
                throw new java.io.IOException("백업 파일 무결성 검증이 실패했어요.");
            android.content.ContentValues done=new android.content.ContentValues();
            done.put(android.provider.MediaStore.MediaColumns.IS_PENDING,0);
            if(resolver.update(location,done,null,null)<=0)
                throw new java.io.IOException("백업 파일을 등록하지 못했어요.");
            published=true;
            return new JSONObject().put("saved",true)
                .put("fileName",filename).put("bytes",bytes.length)
                .put("location","Downloads/RiderSpot");
        } finally {
            if(!published)try{resolver.delete(location,null,null);}
            catch(RuntimeException ignored){}
        }
    }

'''
s=s.replace(method_anchor,method+method_anchor,1)
activity.write_text(s)

b=bridge.read_text()
anchor="  window.__rsNativeSaveGpsBackup = (base64, fileName) =>\n    send('gps-backup-save', {base64, fileName});"
assert b.count(anchor)==1, "Native GPS backup bridge is not present"
b=b.replace(anchor,anchor+'''
  // v60: scoped account JSON backup, supported from the trusted RiderSpot origin.
  window.__rsNativeSaveAccountBackup = (base64, fileName) =>
    send('account-backup-save', {base64, fileName});''',1)
bridge.write_text(b)

g=gradle.read_text()
assert g.count("versionCode 266")==1 and g.count("versionName '1.0.19-lossless-gps-v59'")==1
g=g.replace("versionCode 266","versionCode 267",1)
g=g.replace("versionName '1.0.19-lossless-gps-v59'",
            "versionName '1.0.20-account-backup-v60'",1)
gradle.write_text(g)

assert 'account-backup-save' in s
assert '__rsNativeSaveAccountBackup' in b
print("PASS v60 scoped native account JSON save with SHA256, original GPS unchanged")
