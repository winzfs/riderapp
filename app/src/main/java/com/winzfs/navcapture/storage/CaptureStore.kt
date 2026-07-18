package com.winzfs.navcapture.storage

import android.content.Context
import com.winzfs.navcapture.model.CapturedDestination
import org.json.JSONArray

class CaptureStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun save(capture: CapturedDestination): Boolean {
        val existing = load().toMutableList()
        val last = existing.firstOrNull()
        val duplicate = last != null &&
            last.rawUri == capture.rawUri &&
            last.action == capture.action &&
            capture.capturedAt - last.capturedAt < DUPLICATE_WINDOW_MS
        if (duplicate) return false

        existing.add(0, capture)
        val trimmed = existing.take(MAX_CAPTURES)
        val array = JSONArray()
        trimmed.forEach { array.put(it.toJson()) }
        preferences.edit().putString(KEY_CAPTURES, array.toString()).apply()
        return true
    }

    fun load(): List<CapturedDestination> {
        val raw = preferences.getString(KEY_CAPTURES, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    add(CapturedDestination.fromJson(array.getJSONObject(index)))
                }
            }
        }.getOrDefault(emptyList())
    }

    fun clear() {
        preferences.edit().remove(KEY_CAPTURES).apply()
    }

    companion object {
        private const val PREFERENCES_NAME = "nav_capture_store"
        private const val KEY_CAPTURES = "captures"
        private const val MAX_CAPTURES = 50
        private const val DUPLICATE_WINDOW_MS = 3_000L
    }
}
