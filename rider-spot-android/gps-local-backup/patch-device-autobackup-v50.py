#!/usr/bin/env python3
"""Integrate the device-only 5-minute local GPS backup into the v49 extracted APK.
Requires v49 catalog+restore and v48 MediaStore manual JSON save.
Does not modify existing samples or add network permissions/background jobs.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
base=root/"app/src/main/java/com/riderspot/android"
store=base/"TrackStore.java"
service=base/"TrackingService.java"
source=Path(__file__).resolve().with_name("RiderSpotDeviceAutoBackupV50.java")
target=base/"RiderSpotDeviceAutoBackupV50.java"
gradle=root/"app/build.gradle"
assert all(f.is_file() for f in [store,service,source,gradle])
assert not target.exists()
assert "getSessionsV49" in store.read_text(encoding="utf-8")
target.write_bytes(source.read_bytes())
s=store.read_text(encoding="utf-8")
assert "getSessionForBackupV50" not in s
method=r"""
    /** Read one native session. Never fetch or change GPS samples here. */
    public synchronized JSONObject getSessionForBackupV50(String id) throws JSONException {
        if(id==null||!id.matches("(?i)[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))
            return null;
        try(Cursor c=getReadableDatabase().rawQuery(
            "SELECT s.started_at,s.stopped_at,m.metadata FROM sessions s "+
            "LEFT JOIN trip_archive_meta m ON s.trip_id=m.trip_id WHERE s.trip_id=?",
            new String[]{id})){
            if(!c.moveToFirst())return null;
            JSONObject result=new JSONObject();
            if(!c.isNull(2)){
                try{result=new JSONObject(c.getString(2));}
                catch(JSONException ignored){result=new JSONObject();}
            }
            result.put("trip_id",id);
            result.put("started_at",java.time.Instant.ofEpochMilli(c.getLong(0)).toString());
            result.put("ended_at",c.isNull(1)?JSONObject.NULL:
                java.time.Instant.ofEpochMilli(c.getLong(1)).toString());
            if(!result.has("distance_km"))result.put("distance_km",0);
            if(!result.has("events"))result.put("events",new JSONArray());
            return result;
        }
    }

"""
assert s.rstrip().endswith("}")
s=s.rstrip()[:-1]+method+"\n}\n"
store.write_text(s,encoding="utf-8")

t=service.read_text(encoding="utf-8")
assert "scheduleGpsAutoBackupV50" not in t
anchor="    private boolean destroyed;"
assert t.count(anchor)==1
t=t.replace(anchor,anchor+'''
    // The independent backup thread never blocks main/UI or GPS location callbacks.
    private HandlerThread backupThread;
    private Handler backupHandler;
    private boolean autoBackupScheduled;
    private final Runnable autoBackupEveryFiveMinutesV50=new Runnable(){
        @Override public void run(){
            autoBackupScheduled=false;
            if(destroyed || store==null)return;
            final String trip=store.activeTrip();
            if(trip.isEmpty())return;
            runBackupV50(trip);
            scheduleGpsAutoBackupV50(RiderSpotDeviceAutoBackupV50.PERIOD_MS);
        }
    };
    private void runBackupV50(String trip){
        if(backupHandler==null)return;
        backupHandler.post(()->{
            try{
                boolean ok=RiderSpotDeviceAutoBackupV50.snapshot(
                    getApplicationContext(),store,trip);
                if(ok)Log.i(TAG,"Device GPS backup verified: "+trip);
            }catch(Exception error){
                // GPS recording keeps running even if a backup copy fails.
                Log.w(TAG,"Device GPS backup failed; original SQLite retained",error);
            }
        });
    }
    private void scheduleGpsAutoBackupV50(long delay){
        if(autoBackupScheduled || destroyed)return;
        autoBackupScheduled=true;
        main.postDelayed(autoBackupEveryFiveMinutesV50,Math.max(1000L,delay));
    }
''',1)
old="""        gpsThread = new HandlerThread("RiderSpot-Location-Capture");
        gpsThread.start();"""
new=old+'''
        backupThread=new HandlerThread("RiderSpot-Local-Backup",
            android.os.Process.THREAD_PRIORITY_BACKGROUND);
        backupThread.start();
        backupHandler=new Handler(backupThread.getLooper());'''
assert t.count(old)==1
t=t.replace(old,new,1)
old="""        store.noteGpsServiceActive(true);
        return START_STICKY;"""
new="""        store.noteGpsServiceActive(true);
        // v50: a five-minute independent device backup, even if WebView pauses.
        long age=0L;
        android.content.SharedPreferences history=getSharedPreferences(
            "riderspot_device_backup_v50",MODE_PRIVATE);
        if(id.equals(history.getString("last_trip_id","")))
            age=Math.max(0L,System.currentTimeMillis()-
                history.getLong("last_success_at",0L));
        scheduleGpsAutoBackupV50(
            Math.max(1000L,RiderSpotDeviceAutoBackupV50.PERIOD_MS-age));
        return START_STICKY;"""
assert t.count(old)==1
t=t.replace(old,new,1)
old="""    private void finishService(boolean markStopped) {
        main.removeCallbacks(gpsHealthCheck);
        stopListening(true);
        String active=store.activeTrip();
        if (markStopped && !active.isEmpty()) store.stopTrip(active);
        store.noteGpsServiceActive(false);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }"""
new="""    private void finishService(boolean markStopped) {
        main.removeCallbacks(gpsHealthCheck);
        main.removeCallbacks(autoBackupEveryFiveMinutesV50);
        autoBackupScheduled=false;
        stopListening(true);
        final String active=store.activeTrip();
        if (markStopped && !active.isEmpty()) store.stopTrip(active);
        store.noteGpsServiceActive(false);
        if(markStopped && !active.isEmpty() && backupHandler!=null){
            // The final snapshot is queued before the service shuts down.
            acquireRecordingLock();
            backupHandler.post(()->{
                try{RiderSpotDeviceAutoBackupV50.snapshot(
                    getApplicationContext(),store,active);}
                catch(Exception ex){
                    Log.w(TAG,"Final local backup failed; SQLite retained",ex);
                }finally{
                    main.post(()->{
                        releaseRecordingLock();
                        stopForeground(STOP_FOREGROUND_REMOVE);
                        stopSelf();
                    });
                }
            });
        }else{
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }"""
assert t.count(old)==1
t=t.replace(old,new,1)
old="""        main.removeCallbacks(gpsHealthCheck);
        main.removeCallbacks(renewWakeLock);"""
new="""        main.removeCallbacks(gpsHealthCheck);
        main.removeCallbacks(renewWakeLock);
        main.removeCallbacks(autoBackupEveryFiveMinutesV50);
        if(backupThread!=null)backupThread.quitSafely();"""
assert t.count(old)==1
t=t.replace(old,new,1)
service.write_text(t,encoding="utf-8")
g=gradle.read_text(encoding="utf-8")
assert "versionCode 264" in g and "versionName '1.0.17-device-only-gps-restore'" in g
g=g.replace("versionCode 264","versionCode 265",1)
g=g.replace("versionName '1.0.17-device-only-gps-restore'",
            "versionName '1.0.18-device-only-auto5m'",1)
gradle.write_text(g,encoding="utf-8")
assert "scheduleGpsAutoBackupV50(" in t and "getSessionForBackupV50" in s
print("PASS: 5-minute device backups in TrackingService, no GPS data deleted/uploaded")
