package com.winzfs.navcapture.storage

import android.content.Context
import com.winzfs.navcapture.model.CapturedDestination

class PlaceMemoStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun get(capture: CapturedDestination): String =
        preferences.getString(keyFor(capture), "").orEmpty()

    fun save(capture: CapturedDestination, memo: String) {
        val trimmed = memo.trim()
        if (trimmed.isBlank()) {
            delete(capture)
            return
        }
        preferences.edit().putString(keyFor(capture), trimmed.take(MAX_MEMO_LENGTH)).apply()
    }

    fun delete(capture: CapturedDestination) {
        preferences.edit().remove(keyFor(capture)).apply()
    }

    private fun keyFor(capture: CapturedDestination): String = PlaceKeyFactory.create(
        latitude = capture.latitude,
        longitude = capture.longitude,
        destinationName = capture.destinationName,
        rawUri = capture.rawUri,
    )

    companion object {
        private const val PREFERENCES_NAME = "place_memos"
        private const val MAX_MEMO_LENGTH = 300
    }
}
