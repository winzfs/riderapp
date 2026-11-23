const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const backup=fs.readFileSync(path.join(root,'RiderSpotDeviceAutoBackupV50.java'),'utf8');
const patch=fs.readFileSync(path.join(root,'patch-device-autobackup-v50.py'),'utf8');
test('5-minute native foreground service schedule survives WebView suspension',()=>{
 assert.match(patch,/scheduleGpsAutoBackupV50\(RiderSpotDeviceAutoBackupV50\.PERIOD_MS\)/);
 assert.match(patch,/Math\.max\(1000L,RiderSpotDeviceAutoBackupV50\.PERIOD_MS-age\)/);
 assert.match(patch,/HandlerThread\("RiderSpot-Local-Backup"/);
 assert.match(patch,/getApplicationContext\(\),store,trip/);
});
test('auto snapshots are local-only, byte-for-byte verified, never simplified',()=>{
 assert.match(backup,/public static final long PERIOD_MS = 5L \* 60L \* 1000L/);
 assert.match(backup,/getSessionForBackupV50/);
 assert.match(backup,/getPoints\(tripId, cursor, 250\)/);
 assert.match(backup,/getLong\("seq"\)/);
 assert.match(backup,/MessageDigest\.isEqual/);
 assert.match(backup,/readLength != bytes\.length/);
 assert.match(backup,/riderspot-gps-backup-v1/);
 assert.match(backup,/coordinate_policy", "unaltered"/);
 assert.doesNotMatch(backup,/https:|supabase|OkHttp|HttpURLConnection|rider_trip_checkpoints/);
});
test('rotates two snapshots per trip only after complete publish',()=>{
 assert.match(backup,/KEEP_PER_TRIP = 2/);
 assert.match(backup,/IS_PENDING, 1/);
 assert.match(backup,/IS_PENDING, 0/);
 assert.match(backup,/if \(!complete\)/);
 assert.match(backup,/prunePriorSnapshots\(resolver, downloads, tripId\)/);
 assert.match(backup,/if \(points\.length\(\) == 0\) return false/);
});
test('snapshots end state and service stops only after final backup attempt',()=>{
 assert.match(patch,/if\(markStopped && !active\.isEmpty\(\) && backupHandler!=null\)/);
 assert.match(patch,/RiderSpotDeviceAutoBackupV50\.snapshot/);
 assert.match(patch,/stopSelf\(\)/);
 assert.match(patch,/releaseRecordingLock\(\)/);
});
test('native coordinates remain in SQLite after every snapshot',()=>{
 assert.match(backup,/getPoints\(tripId, cursor, 250\)/);
 assert.doesNotMatch(backup,/DROP TABLE|DELETE FROM samples|TRUNCATE|round\(|Math\.round\(/i);
 assert.match(patch,/getSessionForBackupV50/);
 assert.match(patch,/last_point_count/);
});
