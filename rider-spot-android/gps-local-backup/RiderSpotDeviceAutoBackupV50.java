package com.riderspot.android;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Five-minute lossless GPS backup: ON DEVICE ONLY.
 *
 * Source: TrackStore's durable SQLite samples. A separate, verified JSON copy
 * is published to Downloads/RiderSpot/AutoBackup (Android 10+). At least two
 * complete snapshots are retained per trip; previously saved routes are never
 * edited, shortened or sent to a server.
 *
 * Called off the main thread by TrackingService. No WorkManager/network/upload.
 */
public final class RiderSpotDeviceAutoBackupV50 {
    private static final String TAG = "RiderSpotGpsBackup";
    public static final long PERIOD_MS = 5L * 60L * 1000L;
    private static final String SUBDIRECTORY = Environment.DIRECTORY_DOWNLOADS
        + "/RiderSpot/AutoBackup/";
    private static final int MAX_SAMPLES = 20000;
    private static final int MAX_BACKUP_BYTES = 7_500_000;
    private static final int KEEP_PER_TRIP = 2;
    private RiderSpotDeviceAutoBackupV50() {}

    public static boolean snapshot(Context context, TrackStore store, String tripId) throws Exception {
        if (Build.VERSION.SDK_INT < 29) {
            throw new IllegalStateException("Android 10 이상에서 기기 자동백업을 지원해요.");
        }
        if (tripId == null || !tripId.matches(
            "(?i)[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))
            throw new IllegalArgumentException("Invalid GPS trip id");
        JSONObject details = store.getSessionForBackupV50(tripId);
        if (details == null) throw new IllegalStateException("SQLite session not found");
        // Preserve the original database order and every floating-point value.
        JSONArray points = new JSONArray();
        long cursor = 0L;
        while (true) {
            JSONArray batch = store.getPoints(tripId, cursor, 250);
            if (batch.length() == 0) break;
            for (int i = 0; i < batch.length(); i++) {
                JSONObject point = batch.getJSONObject(i);
                long seq = point.getLong("seq");
                if (seq <= cursor) throw new IllegalStateException("GPS sequence changed");
                cursor = seq;
                points.put(point);
                if (points.length() > MAX_SAMPLES)
                    throw new IllegalStateException("GPS sample limit exceeded; old backup retained");
            }
            if (batch.length() < 250) break;
        }
        if (points.length() == 0) return false; // Do not overwrite a good backup with an empty trip.
        details.put("points", points);
        details.put("source", "android-sqlite-auto");
        details.put("partial", details.isNull("ended_at"));
        if (!details.has("events")) details.put("events", new JSONArray());
        JSONObject payload = new JSONObject();
        payload.put("format", "riderspot-gps-backup-v1");
        payload.put("generated_at", java.time.Instant.now().toString());
        payload.put("coordinate_policy", "unaltered");
        payload.put("scope", "device-auto-backup");
        payload.put("file_part", 1);
        payload.put("total_parts", 1);
        payload.put("count", 1);
        payload.put("entries", new JSONArray().put(details));
        byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BACKUP_BYTES)
            throw new IllegalStateException("GPS backup exceeded safe size; raw SQLite retained");

        ContentResolver resolver = context.getContentResolver();
        Uri downloads = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String filename = "RiderSpot-Auto-GPS-" + tripId + "-"
            + System.currentTimeMillis() + ".json";
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, SUBDIRECTORY);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri created = resolver.insert(downloads, values);
        if (created == null) throw new IllegalStateException("Could not create local GPS backup");
        boolean complete = false;
        try {
            try (OutputStream out = resolver.openOutputStream(created, "w")) {
                if (out == null) throw new IllegalStateException("GPS backup output unavailable");
                out.write(bytes);
                out.flush();
            }
            // Verify the complete file BEFORE publishing it or deleting an older copy.
            byte[] beforeHash = MessageDigest.getInstance("SHA-256").digest(bytes);
            MessageDigest readHash = MessageDigest.getInstance("SHA-256");
            int readLength = 0;
            try (InputStream in = resolver.openInputStream(created)) {
                if (in == null) throw new IllegalStateException("Could not read back backup");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    readLength += count;
                    readHash.update(buffer, 0, count);
                }
            }
            if (readLength != bytes.length ||
                !MessageDigest.isEqual(beforeHash, readHash.digest()))
                throw new IllegalStateException("GPS backup verification failed");
            ContentValues visible = new ContentValues();
            visible.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(created, visible, null, null) <= 0)
                throw new IllegalStateException("GPS backup publish failed");
            complete = true;
        } finally {
            if (!complete) {
                try { resolver.delete(created, null, null); }
                catch (RuntimeException ignored) { /* Original SQLite and prior copies remain */ }
            }
        }
        // A new verified backup now exists. Never delete the original GPS
        // database or any backups belonging to a different trip.
        try { prunePriorSnapshots(resolver, downloads, tripId); }
        catch (RuntimeException e) { Log.w(TAG, "Could not prune extra backups", e); }
        context.getSharedPreferences("riderspot_device_backup_v50", Context.MODE_PRIVATE)
            .edit().putLong("last_success_at", System.currentTimeMillis())
            .putString("last_trip_id", tripId)
            .putInt("last_point_count", points.length()).apply();
        return true;
    }

    /** Keep two separate verified snapshots per ride; the old one survives a bad write. */
    private static void prunePriorSnapshots(ContentResolver resolver, Uri downloads, String tripId) {
        String prefix = "RiderSpot-Auto-GPS-" + tripId + "-";
        List<Snapshot> backups = new ArrayList<>();
        String[] projection = {
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.IS_PENDING
        };
        try (Cursor c = resolver.query(
            downloads, projection,
            MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " +
                MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
            new String[]{SUBDIRECTORY, prefix + "%.json"}, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String name = c.getString(1);
                if (name == null || !name.startsWith(prefix) || !name.endsWith(".json") ||
                    c.getInt(2) != 0) continue;
                backups.add(new Snapshot(c.getLong(0), name));
            }
        }
        backups.sort((a,b)->b.name.compareTo(a.name));
        for (int i=KEEP_PER_TRIP;i<backups.size();i++) {
            Uri uri=Uri.withAppendedPath(downloads,Long.toString(backups.get(i).id));
            try { resolver.delete(uri,null,null); }
            catch (RuntimeException e) { Log.w(TAG, "Old snapshot retention cleanup deferred",e); }
        }
    }
    private static final class Snapshot {
        final long id; final String name;
        Snapshot(long id, String name){this.id=id;this.name=name;}
    }
}
