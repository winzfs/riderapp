#!/usr/bin/env python3
"""v49 device-only GPS: SQLite full catalog, atomic JSON restore, no native cloud uploads."""
from pathlib import Path
import re,sys
root=Path(sys.argv[1]).resolve()
store=root/"app/src/main/java/com/riderspot/android/TrackStore.java"
activity=root/"app/src/main/java/com/riderspot/android/MainActivity.java"
bridge=root/"app/src/main/assets/native-bridge.js"
gradle=root/"app/build.gradle"
assert all(x.is_file() for x in [store,activity,bridge,gradle])
s=store.read_text(encoding="utf8")
assert 'public synchronized JSONArray getSessionsV49()' not in s
assert s.count('super(context, DB, null, 2)')==1
s=s.replace('super(context, DB, null, 2)','super(context, DB, null, 3)',1)
anchor='db.execSQL("CREATE INDEX idx_samples_trip_time ON samples(trip_id,recorded_at)");'
assert s.count(anchor)==1
s=s.replace(anchor,anchor+'\n        db.execSQL("CREATE TABLE trip_archive_meta (trip_id TEXT PRIMARY KEY, metadata TEXT NOT NULL)");',1)
upgrade='if (oldVersion < 2) db.execSQL("CREATE INDEX IF NOT EXISTS idx_samples_trip_time ON samples(trip_id,recorded_at)");'
assert s.count(upgrade)==1
s=s.replace(upgrade,upgrade+'\n        if (oldVersion < 3) db.execSQL("CREATE TABLE IF NOT EXISTS trip_archive_meta (trip_id TEXT PRIMARY KEY, metadata TEXT NOT NULL)");',1)
extra=r"""
    private long parseImportedTime(String iso) throws JSONException {
        if (iso == null || iso.isEmpty()) return 0L;
        try { return java.time.Instant.parse(iso).toEpochMilli(); }
        catch (RuntimeException error) { throw new JSONException("Invalid GPS backup timestamp"); }
    }

    /** Enumerate all local sessions: never restrict to the one active/last-stopped ID. */
    public synchronized JSONArray getSessionsV49() throws JSONException {
        JSONArray out=new JSONArray();
        String sql="SELECT s.trip_id,s.started_at,s.stopped_at,s.paused,"+
            "(SELECT COUNT(*) FROM samples p WHERE p.trip_id=s.trip_id),m.metadata "+
            "FROM sessions s LEFT JOIN trip_archive_meta m ON m.trip_id=s.trip_id "+
            "ORDER BY s.started_at DESC";
        try (Cursor c=getReadableDatabase().rawQuery(sql,null)) {
            while(c.moveToNext()){
                if(c.getInt(4)<=0)continue;
                JSONObject e=null;
                if(!c.isNull(5)) {
                    try { e=new JSONObject(c.getString(5)); }
                    catch(JSONException ignored) {}
                }
                if(e==null)e=new JSONObject();
                String id=c.getString(0);
                e.put("id",id);
                e.put("started_at",java.time.Instant.ofEpochMilli(c.getLong(1)).toString());
                e.put("ended_at",c.isNull(2)?JSONObject.NULL:
                    java.time.Instant.ofEpochMilli(c.getLong(2)).toString());
                e.put("point_count",c.getInt(4));
                e.put("native_state",id.equals(activeTrip())?"active":
                    (c.isNull(2)?"unknown":"stopped"));
                e.put("sqlite",true);
                out.put(e);
            }
        }
        return out;
    }

    /** File-level transaction: on error, leave every existing GPS row unchanged. */
    public synchronized JSONObject importBackupV49(JSONArray entries) throws JSONException {
        if(entries==null||entries.length()<1||entries.length()>100)
            throw new JSONException("Invalid backup entry count");
        SQLiteDatabase db=getWritableDatabase();
        int inserted=0,unchanged=0,pointsWritten=0;
        java.util.HashSet<String> seen=new java.util.HashSet<>();
        db.beginTransaction();
        try{
            for(int i=0;i<entries.length();i++){
                JSONObject entry=entries.getJSONObject(i);
                String id=entry.optString("trip_id","");
                if(!id.matches("(?i)[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))
                    throw new JSONException("Invalid backup trip id");
                if(!seen.add(id))throw new JSONException("Duplicate trip in backup file");
                if(id.equals(activeTrip()))
                    throw new JSONException("Cannot restore over active GPS recording");
                JSONArray points=entry.optJSONArray("points");
                if(points==null||points.length()<1||points.length()>20000)
                    throw new JSONException("Invalid GPS point count");
                long begin=parseImportedTime(entry.optString("started_at",""));
                if(begin<946684800000L||begin>System.currentTimeMillis()+86400000L)
                    throw new JSONException("Invalid trip start");
                String ended=entry.isNull("ended_at")?"":entry.optString("ended_at","");
                long finish=ended.isEmpty()?0L:parseImportedTime(ended);
                if(finish>0L&&finish<begin)throw new JSONException("Invalid trip end");

                for(int j=0;j<points.length();j++){
                    JSONObject p=points.getJSONObject(j);
                    double lat=p.optDouble("lat",Double.NaN);
                    double lng=p.optDouble("lng",Double.NaN);
                    long t=p.optLong("t",0L);
                    if(!Double.isFinite(lat)||!Double.isFinite(lng)||
                        Math.abs(lat)>90d||Math.abs(lng)>180d||
                        t<946684800000L||t>System.currentTimeMillis()+86400000L)
                        throw new JSONException("Invalid GPS coordinate/timestamp");
                }

                int existing=0;
                try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM samples WHERE trip_id=?",
                    new String[]{id})){
                    if(c.moveToFirst())existing=c.getInt(0);
                }
                if(existing>0){
                    if(existing!=points.length())
                        throw new JSONException("Existing GPS route differs; nothing overwritten");
                    try(Cursor c=db.rawQuery(
                        "SELECT lat,lng,recorded_at FROM samples WHERE trip_id=? ORDER BY seq",
                        new String[]{id})){
                        for(int j=0;j<points.length();j++){
                            if(!c.moveToNext())throw new JSONException("Stored GPS length mismatch");
                            JSONObject p=points.getJSONObject(j);
                            if(Double.compare(c.getDouble(0),p.getDouble("lat"))!=0||
                               Double.compare(c.getDouble(1),p.getDouble("lng"))!=0||
                               c.getLong(2)!=p.getLong("t"))
                                throw new JSONException("Existing GPS differs; no overwrite");
                        }
                    }
                    unchanged++;
                    continue;
                }

                ContentValues session=new ContentValues();
                session.put("trip_id",id);
                session.put("started_at",begin);
                if(finish>0L)session.put("stopped_at",finish);
                session.put("paused",0);
                db.insertWithOnConflict("sessions",null,session,SQLiteDatabase.CONFLICT_IGNORE);
                // Preserve original sample order, lat/lng double values and timestamps.
                // New SQLite autoincrement sequence numbers are local storage cursors.
                for(int j=0;j<points.length();j++){
                    JSONObject p=points.getJSONObject(j);
                    ContentValues sample=new ContentValues();
                    sample.put("trip_id",id);
                    sample.put("lat",p.getDouble("lat"));
                    sample.put("lng",p.getDouble("lng"));
                    sample.put("accuracy",p.optDouble("accuracy",0d));
                    sample.put("heading",p.optDouble("heading",0d));
                    sample.put("speed",p.optDouble("speed",0d));
                    sample.put("recorded_at",p.getLong("t"));
                    if(db.insertOrThrow("samples",null,sample)<0)
                        throw new JSONException("Cannot restore GPS point");
                    pointsWritten++;
                }
                JSONObject metadata=new JSONObject(entry.toString());
                metadata.remove("points");
                metadata.put("id",id);
                ContentValues meta=new ContentValues();
                meta.put("trip_id",id);
                meta.put("metadata",metadata.toString());
                db.insertWithOnConflict("trip_archive_meta",null,meta,
                    SQLiteDatabase.CONFLICT_REPLACE);
                inserted++;
            }
            db.setTransactionSuccessful();
        } finally {db.endTransaction();}
        return new JSONObject().put("restored",inserted).put("existing",unchanged)
            .put("points",pointsWritten);
    }
"""
assert s.rstrip().endswith("}")
s=s.rstrip()[:-1]+extra+"\n}\n"
store.write_text(s,encoding="utf8")

j=activity.read_text(encoding="utf8")
anchor='            case "gps-backup-save":\n                return saveGpsBackupJson(req);'
assert j.count(anchor)==1
replace=anchor+'''
            case "gps-backup-list":
                return new JSONObject().put("trips",store.getSessionsV49());
            case "gps-backup-import":
                return importGpsBackupJsonV49(req);
'''
j=j.replace(anchor,replace,1)
marker="    private JSONObject processRequest(JSONObject req) throws Exception {"
assert j.count(marker)==1
method=r"""
    /** Trusted-origin, user-initiated JSON restore. Never calls cloud APIs. */
    private JSONObject importGpsBackupJsonV49(JSONObject req) throws Exception {
        String encoded=req.optString("base64","");
        if(encoded.length()<80||encoded.length()>11_000_000)
            throw new IllegalArgumentException("GPS backup file too large");
        byte[] raw=android.util.Base64.decode(encoded,android.util.Base64.DEFAULT);
        if(raw.length<60||raw.length>7_500_000)
            throw new IllegalArgumentException("GPS backup size invalid");
        JSONObject payload=new JSONObject(new String(raw,java.nio.charset.StandardCharsets.UTF_8));
        if(!"riderspot-gps-backup-v1".equals(payload.optString("format")))
            throw new IllegalArgumentException("Not a RiderSpot GPS backup");
        return store.importBackupV49(payload.getJSONArray("entries"));
    }

"""
j=j.replace(marker,method+marker,1)
activity.write_text(j,encoding="utf8")

b=bridge.read_text(encoding="utf8")
entry='  window.__rsNativeSaveGpsBackup = (base64, fileName) =>\n    send(\'gps-backup-save\', {base64, fileName});'
assert b.count(entry)==1
b=b.replace(entry,entry+'''
  window.__rsNativeListGpsTrips = () => send('gps-backup-list');
  window.__rsNativeImportGpsBackup = (base64) =>
    send('gps-backup-import', {base64});
''',1)
# Disable the v1.0.15 cloud uploader in the rebuilt APK.
old="async function tick(force=false){\n    if(running)return;"
assert b.count(old)==1
b=b.replace(old,"async function tick(force=false){\n    return; // v49 device-only GPS: no cloud checkpoint writes.\n    if(running)return;",1)
# Completed-trip native bridge must not upload GPS or queue a cloud retry.
old="    if (userId === 'guest') return;\n    const pendingKey = 'rs:pending:trips:' + userId;"
assert b.count(old)==1
b=b.replace(old,"    // Device-only GPS: preserve native SQLite; never upload or enqueue routes.\n    return;\n    if (userId === 'guest') return;\n    const pendingKey = 'rs:pending:trips:' + userId;",1)
bridge.write_text(b,encoding="utf8")

g=gradle.read_text(encoding="utf8")
assert "versionCode 263" in g and "versionName '1.0.16-local-gps-backup'" in g
g=g.replace("versionCode 263","versionCode 264",1)
g=g.replace("versionName '1.0.16-local-gps-backup'",
            "versionName '1.0.17-device-only-gps-restore'",1)
gradle.write_text(g,encoding="utf8")
assert 'getSessionsV49()' in s and 'importBackupV49' in s
assert "versionCode 264" in g and 'case "gps-backup-import":' in j
assert b.count("v49 device-only GPS")==1
print("PASS v49: SQLite catalog/atomic restore, no native GPS upload")
