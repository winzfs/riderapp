#!/usr/bin/env python3
"""v59 native, lossless GPS archives. Apply after v48/v49/v50 APK patches.

The production WebView UI/assets and its existing feature logic are untouched.
Existing SQLite points stay queryable by their ORIGINAL global seq across an
atomic per-block migration. The new native event store is additive.
"""
from pathlib import Path
import re, sys

root=Path(sys.argv[1]).resolve()
java=root/"app/src/main/java/com/riderspot/android"
store=java/"TrackStore.java"
main=java/"MainActivity.java"
gradle=root/"app/build.gradle"
codec=Path(__file__).with_name("RiderSpotGpsCodecV59.java")
assert all(p.is_file() for p in (store, main, gradle, codec))
assert not (java/"RiderSpotGpsCodecV59.java").exists()
assert "getSessionsV49" in store.read_text()
assert "getSessionForBackupV50" in store.read_text()
(java/"RiderSpotGpsCodecV59.java").write_bytes(codec.read_bytes())

s=store.read_text()
assert "gps_blocks_v59" not in s
assert s.count('super(context, DB, null, 3)')==1
s=s.replace('super(context, DB, null, 3)',
            'super(context, DB, null, 4)',1)
s=s.replace('preferences = context.getSharedPreferences("rider_spot_native", Context.MODE_PRIVATE);',
'''preferences = context.getSharedPreferences("rider_spot_native", Context.MODE_PRIVATE);
        scheduleArchiveV59();''',1)
schema=r'''
        db.execSQL("CREATE TABLE gps_blocks_v59 (trip_id TEXT NOT NULL, first_seq INTEGER NOT NULL, last_seq INTEGER NOT NULL, min_time INTEGER NOT NULL, max_time INTEGER NOT NULL, point_count INTEGER NOT NULL, raw_bytes INTEGER NOT NULL, sha256 BLOB NOT NULL, compressed BLOB NOT NULL, format_version INTEGER NOT NULL, PRIMARY KEY(trip_id,first_seq))");
        db.execSQL("CREATE INDEX idx_gps_blocks_v59_seek ON gps_blocks_v59(trip_id,last_seq)");
        db.execSQL("CREATE TABLE gps_events_v59 (trip_id TEXT NOT NULL, event_id TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(trip_id,event_id))");
        db.execSQL("CREATE INDEX idx_gps_events_v59_time ON gps_events_v59(trip_id,timestamp_ms)");
'''
anchor='db.execSQL("CREATE INDEX idx_samples_trip_time ON samples(trip_id,recorded_at)");'
assert s.count(anchor)==1
s=s.replace(anchor,anchor+schema,1)
upgrade='if (oldVersion < 3) db.execSQL("CREATE TABLE IF NOT EXISTS trip_archive_meta (trip_id TEXT PRIMARY KEY, metadata TEXT NOT NULL)");'
assert s.count(upgrade)==1
s=s.replace(upgrade,upgrade+'''
        if (oldVersion < 4) {
            db.execSQL("CREATE TABLE IF NOT EXISTS gps_blocks_v59 (trip_id TEXT NOT NULL, first_seq INTEGER NOT NULL, last_seq INTEGER NOT NULL, min_time INTEGER NOT NULL, max_time INTEGER NOT NULL, point_count INTEGER NOT NULL, raw_bytes INTEGER NOT NULL, sha256 BLOB NOT NULL, compressed BLOB NOT NULL, format_version INTEGER NOT NULL, PRIMARY KEY(trip_id,first_seq))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_gps_blocks_v59_seek ON gps_blocks_v59(trip_id,last_seq)");
            db.execSQL("CREATE TABLE IF NOT EXISTS gps_events_v59 (trip_id TEXT NOT NULL, event_id TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(trip_id,event_id))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_gps_events_v59_time ON gps_events_v59(trip_id,timestamp_ms)");
        }''',1)

# The 14,500-row hard cap silently truncated otherwise-valid 1s GPS fixes.
cap=re.compile(r'        try \(Cursor c = getReadableDatabase\(\).rawQuery\("SELECT COUNT\(\*\) FROM samples WHERE trip_id=\?",new String\[\]\{id\}\)\) \{\s*if \(c.moveToFirst\(\) && c.getInt\(0\) >= 14_500\) return false;\s*\}\s*')
s,n=cap.subn('',s,count=1)
assert n==1, "v59: original 14,500 point cap changed"
# A formerly completed trip is never allowed to become active while archived.
stop_old='preferences.edit().remove("active_trip").putBoolean("paused", false).putString("last_stopped", id).apply();'
assert s.count(stop_old)==1
s=s.replace(stop_old,stop_old+'''
        preferences.edit().putBoolean("gps_archive_scan_completed_v59",false).apply();
        scheduleArchiveV59();''',1)
get_state='out.put("gpsServiceActive",preferences.getBoolean("gps_service_active",false));'
assert s.count(get_state)==1
s=s.replace(get_state,get_state+'''
        out.put("gpsArchiveV59",true);
        scheduleArchiveV59();''',1)

# Restorable session catalog must include BOTH legacy and archive counts.
count='(SELECT COUNT(*) FROM samples p WHERE p.trip_id=s.trip_id),m.metadata '
assert s.count(count)==1
s=s.replace(count,'(SELECT COUNT(*) FROM samples p WHERE p.trip_id=s.trip_id)+COALESCE((SELECT SUM(b.point_count) FROM gps_blocks_v59 b WHERE b.trip_id=s.trip_id),0),m.metadata ',1)

# Backup import must not treat archived trips as empty. Compare the existing
# route THROUGH the common getPoints API to prevent duplicate restorations.
start=s.index('                int existing=0;',s.index('public synchronized JSONObject importBackupV49'))
end=s.index('                ContentValues session=new ContentValues();',start)
old=s[start:end]
assert 'if(existing>0)' in old and 'SELECT lat,lng,recorded_at FROM samples' in old
replacement=r'''
                int existing=0;
                try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM samples WHERE trip_id=?",
                    new String[]{id})){
                    if(c.moveToFirst())existing=c.getInt(0);
                }
                try(Cursor c=db.rawQuery("SELECT COALESCE(SUM(point_count),0) FROM gps_blocks_v59 WHERE trip_id=?",
                    new String[]{id})){
                    if(c.moveToFirst())existing+=c.getInt(0);
                }
                if(existing>0){
                    if(existing!=points.length())
                        throw new JSONException("Existing GPS route differs; nothing overwritten");
                    long lastSeq=0L;
                    int checked=0;
                    while(checked<points.length()){
                        JSONArray batch=getPoints(id,lastSeq,250);
                        if(batch.length()==0)
                            throw new JSONException("Existing archived GPS points unavailable");
                        for(int k=0;k<batch.length();k++){
                            JSONObject saved=batch.getJSONObject(k);
                            JSONObject incoming=points.getJSONObject(checked++);
                            if(Double.compare(saved.getDouble("lat"),incoming.getDouble("lat"))!=0||
                               Double.compare(saved.getDouble("lng"),incoming.getDouble("lng"))!=0||
                               saved.getLong("t")!=incoming.getLong("t"))
                                throw new JSONException("Existing GPS differs; no overwrite");
                            lastSeq=saved.getLong("seq");
                        }
                    }
                    unchanged++;
                    continue;
                }

'''
s=s[:start]+replacement+s[end:]

# Existing getPoints implementation remains the BRIDGE API and name, but now
# merges archived and live rows by original seq with no loss of order.
p=s.index('    public synchronized JSONArray getPoints(String id, long sinceSeq, int limit) throws JSONException {')
brace=s.index("{",p)
depth=1; i=brace+1
while depth:
    if s[i]=="{": depth+=1
    elif s[i]=="}": depth-=1
    i+=1
assert 'SELECT seq,lat,lng' in s[p:i]
new_method=r'''
    /** All legacy, live and archived points use the same stable seq cursor. */
    public synchronized JSONArray getPoints(String id,long sinceSeq,int limit)
        throws JSONException {
        JSONArray out=new JSONArray();
        if(id==null || !id.matches("[a-fA-F0-9-]{36}"))return out;
        final int cap=Math.max(1,Math.min(250,limit));
        final long cursor=Math.max(0L,sinceSeq);
        java.util.TreeMap<Long,RiderSpotGpsCodecV59.Fix> ordered=
            new java.util.TreeMap<>();
        // Only blocks with seq beyond the cursor are decoded. This preserves
        // v58's selected-day seeks and timed route playback.
        try(Cursor c=getReadableDatabase().rawQuery(
            "SELECT first_seq,last_seq,point_count,raw_bytes,sha256,compressed,format_version FROM gps_blocks_v59 "+
            "WHERE trip_id=? AND last_seq>? ORDER BY first_seq",
            new String[]{id,Long.toString(cursor)})){
            while(c.moveToNext() && ordered.size()<cap){
                if(c.getInt(6)!=RiderSpotGpsCodecV59.VERSION)
                    throw new JSONException("Unknown GPS archive version");
                java.util.List<RiderSpotGpsCodecV59.Fix> block;
                try {
                    block=RiderSpotGpsCodecV59.decode(c.getBlob(5),c.getInt(3),c.getBlob(4));
                } catch(java.io.IOException e) {
                    throw new JSONException("GPS archive validation failed: "+e.getMessage());
                }
                if(block.size()!=c.getInt(2) ||
                   block.get(0).seq!=c.getLong(0) ||
                   block.get(block.size()-1).seq!=c.getLong(1))
                    throw new JSONException("GPS archive block index mismatch");
                for(RiderSpotGpsCodecV59.Fix fix:block)
                    if(fix.seq>cursor)ordered.put(fix.seq,fix);
            }
        }
        try(Cursor c=getReadableDatabase().rawQuery(
            "SELECT seq,lat,lng,accuracy,heading,speed,recorded_at FROM samples "+
            "WHERE trip_id=? AND seq>? ORDER BY seq ASC LIMIT "+cap,
            new String[]{id,Long.toString(cursor)})){
            while(c.moveToNext()){
                RiderSpotGpsCodecV59.Fix f=new RiderSpotGpsCodecV59.Fix(
                    c.getLong(0),c.getLong(6),c.getDouble(1),c.getDouble(2),
                    c.getDouble(3),c.getDouble(4),c.getDouble(5));
                if(ordered.put(f.seq,f)!=null)
                    throw new JSONException("Duplicate raw and archived GPS sequence");
            }
        }
        int written=0;
        for(RiderSpotGpsCodecV59.Fix f:ordered.values()){
            if(written++>=cap)break;
            JSONObject point=new JSONObject();
            point.put("seq",f.seq);
            point.put("lat",f.lat);
            point.put("lng",f.lng);
            point.put("accuracy",f.accuracy);
            point.put("heading",f.heading);
            point.put("speed",f.speed);
            point.put("t",f.time);
            out.put(point);
        }
        return out;
    }
'''
s=s[:p]+new_method+s[i:]
additional=r'''
    // An archive worker never touches the active trip, and never deletes an
    // unverified block. Interrupted migrations restart from the raw rows.
    private static final java.util.concurrent.atomic.AtomicBoolean ARCHIVING_V59=
        new java.util.concurrent.atomic.AtomicBoolean(false);
    private static volatile long lastArchiveTryV59;
    private void scheduleArchiveV59(){
        if(preferences.getBoolean("gps_archive_scan_completed_v59",false))return;
        long now=android.os.SystemClock.elapsedRealtime();
        if(now-lastArchiveTryV59<15000L)return;
        if(!ARCHIVING_V59.compareAndSet(false,true))return;
        lastArchiveTryV59=now;
        new Thread(()->{
            boolean success=false;
            try{
                while(true){
                    String id;
                    synchronized(this){
                        try(Cursor c=getReadableDatabase().rawQuery(
                            "SELECT trip_id FROM sessions s WHERE stopped_at IS NOT NULL "+
                            "AND EXISTS(SELECT 1 FROM samples p WHERE p.trip_id=s.trip_id) "+
                            "ORDER BY started_at LIMIT 1",null)){
                            id=c.moveToFirst()?c.getString(0):null;
                        }
                    }
                    if(id==null){success=true;break;}
                    if(id.equals(activeTrip()))break;
                    if(!archiveOneBlockV59(id))break;
                    Thread.yield();
                }
            }catch(Exception|LinkageError error){
                android.util.Log.e("RiderSpotGPS","v59 archive postponed; raw SQLite safe",error);
            }finally{
                if(success)preferences.edit().putBoolean("gps_archive_scan_completed_v59",true).apply();
                ARCHIVING_V59.set(false);
            }
        },"RiderSpot-GPS-Archive-V59").start();
    }

    private synchronized boolean archiveOneBlockV59(String id) throws java.io.IOException {
        if(id.equals(activeTrip()))return false;
        final SQLiteDatabase db=getWritableDatabase();
        try(Cursor c=db.rawQuery("SELECT stopped_at FROM sessions WHERE trip_id=?",
            new String[]{id})){
            if(!c.moveToFirst() || c.isNull(0))return false;
        }
        java.util.ArrayList<RiderSpotGpsCodecV59.Fix> source=new java.util.ArrayList<>();
        try(Cursor c=db.rawQuery(
            "SELECT seq,lat,lng,accuracy,heading,speed,recorded_at FROM samples "+
            "WHERE trip_id=? ORDER BY seq LIMIT "+RiderSpotGpsCodecV59.BLOCK_POINTS,
            new String[]{id})){
            while(c.moveToNext())source.add(new RiderSpotGpsCodecV59.Fix(
                c.getLong(0),c.getLong(6),c.getDouble(1),c.getDouble(2),
                c.getDouble(3),c.getDouble(4),c.getDouble(5)));
        }
        if(source.isEmpty())return false;
        RiderSpotGpsCodecV59.Packed packed=RiderSpotGpsCodecV59.encode(source);
        java.util.List<RiderSpotGpsCodecV59.Fix> decoded=
            RiderSpotGpsCodecV59.decode(packed.zstd,packed.rawLength,packed.sha256);
        if(decoded.size()!=source.size())
            throw new java.io.IOException("GPS archive round-trip count failed");
        for(int i=0;i<source.size();i++)
            if(!source.get(i).sameBits(decoded.get(i)))
                throw new java.io.IOException("GPS archive bitwise round-trip failed at "+i);
        db.beginTransaction();
        try{
            ContentValues values=new ContentValues();
            values.put("trip_id",id);
            values.put("first_seq",packed.firstSeq);
            values.put("last_seq",packed.lastSeq);
            values.put("min_time",packed.minTime);
            values.put("max_time",packed.maxTime);
            values.put("point_count",packed.count);
            values.put("raw_bytes",packed.rawLength);
            values.put("sha256",packed.sha256);
            values.put("compressed",packed.zstd);
            values.put("format_version",RiderSpotGpsCodecV59.VERSION);
            db.insertOrThrow("gps_blocks_v59",null,values);
            int deleted=db.delete("samples",
                "trip_id=? AND seq>=? AND seq<=?",
                new String[]{id,Long.toString(packed.firstSeq),Long.toString(packed.lastSeq)});
            if(deleted!=source.size())
                throw new java.io.IOException("GPS source changed; rollback archive transaction");
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        return true;
    }

    /** Native event copies survive WebView cache removal; this is additive. */
    public synchronized JSONObject saveEventsV59(String id,JSONArray events)
        throws JSONException {
        if(id==null || !id.matches("[a-fA-F0-9-]{36}") ||
           events==null || events.length()>50000)
            throw new JSONException("Invalid GPS event set");
        final SQLiteDatabase db=getWritableDatabase();
        try(Cursor c=db.rawQuery("SELECT 1 FROM sessions WHERE trip_id=?",
            new String[]{id})){
            if(!c.moveToFirst())throw new JSONException("GPS session missing");
        }
        db.beginTransaction();
        try{
            for(int i=0;i<events.length();i++){
                JSONObject event=events.getJSONObject(i);
                String identity=event.optString("id","");
                if(identity.isEmpty())identity=id+":"+i+":"+event.optString("at","")+":"+event.optString("type","");
                if(identity.length()>250)throw new JSONException("GPS event id invalid");
                long t=0L;
                try{t=java.time.Instant.parse(event.optString("at","")).toEpochMilli();}
                catch(RuntimeException ignored){t=0L;}
                ContentValues row=new ContentValues();
                row.put("trip_id",id);
                row.put("event_id",identity);
                row.put("timestamp_ms",t);
                row.put("data",event.toString());
                db.insertWithOnConflict("gps_events_v59",null,row,SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        return new JSONObject().put("stored",events.length());
    }
    public synchronized JSONArray getEventsV59(String id) throws JSONException {
        JSONArray result=new JSONArray();
        if(id==null || !id.matches("[a-fA-F0-9-]{36}"))return result;
        try(Cursor c=getReadableDatabase().rawQuery(
            "SELECT data FROM gps_events_v59 WHERE trip_id=? ORDER BY timestamp_ms,event_id",
            new String[]{id})){
            while(c.moveToNext())result.put(new JSONObject(c.getString(0)));
        }
        return result;
    }
'''
assert s.rstrip().endswith("}")
s=s.rstrip()[:-1]+additional+"\n}\n"
# Include the durable native events in all future JSON backup exports.
anchor='if(!result.has("events"))result.put("events",new JSONArray());'
assert s.count(anchor)==1
s=s.replace(anchor,'''JSONArray nativeEvents=getEventsV59(id);
            if(nativeEvents.length()>0)result.put("events",nativeEvents);
            else if(!result.has("events"))result.put("events",new JSONArray());''',1)
store.write_text(s)

j=main.read_text()
anchor='            case "state": return store.getState();'
assert j.count(anchor)==1
j=j.replace(anchor,anchor+'''
            case "gps-events-save":
                return store.saveEventsV59(id,req.optJSONArray("events"));
            case "gps-events-read":
                return new JSONObject().put("events",store.getEventsV59(id));''',1)
main.write_text(j)

# The existing trusted-origin bridge exposes a read-only native-events helper.
# No CSS, HTML, Android view or existing handler is modified.
bridge=root/"app/src/main/assets/native-bridge.js"
b=bridge.read_text()
# The legacy native finalizer re-copied up to 14,999 GPS fixes into WebView
# localStorage (and silently truncated the rest) AFTER v58 had written a small
# summary. Native SQLite is now the source of truth: its modern reader alone
# owns stopped-trip hydration, and legacy finalization MUST NOT overwrite it.
old_finalizer="  async function finalizeNativeTrip(tripId) {\n    const nativePoints = await loadAll(tripId);"
assert b.count(old_finalizer)==1
b=b.replace(old_finalizer,
    "  async function finalizeNativeTrip(tripId) {\n"
    "    // v59: Android SQLite is authoritative. The modern GPS reader owns\n"
    "    // completed-trip recovery. Never overwrite the WebView summary with\n"
    "    // an old 14,999-point route or duplicate coordinates in localStorage.\n"
    "    if (window.__rsGPS42NativeRead?.allPoints) return;\n"
    "    const nativePoints = await loadAll(tripId);",1)
anchor="  window.__rsNativeGpsDiagnostics = () => send('state');"
assert b.count(anchor)==1
b=b.replace(anchor,
    "  window.__rsNativeGpsArchiveV59 = true;\n"
    "  window.__rsNativeReadEventsV59 = (tripId) => send('gps-events-read', {tripId});\n"
    +anchor,1)
bridge.write_text(b)

g=gradle.read_text()
assert "versionCode 265" in g and "versionName '1.0.18-device-only-auto5m'" in g
g=g.replace("versionCode 265","versionCode 266",1)
g=g.replace("versionName '1.0.18-device-only-auto5m'",
    "versionName '1.0.19-lossless-gps-v59'",1)
anchor="implementation 'com.google.android.gms:play-services-location:21.4.0'"
assert g.count(anchor)==1
g=g.replace(anchor,anchor+"\n    implementation 'com.github.luben:zstd-jni:1.5.7-8@aar'\n    testImplementation 'com.github.luben:zstd-jni:1.5.7-8'",1)
gradle.write_text(g)
assert 'gps_blocks_v59' in s and 'gpsArchiveV59' in s
assert 'getPoints(String id,long sinceSeq,int limit)' in s
print("PASS v59 source patch: lossless codec, original-seq paging, native events, migration")
