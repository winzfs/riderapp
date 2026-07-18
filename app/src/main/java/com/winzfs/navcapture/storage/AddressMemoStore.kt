package com.winzfs.navcapture.storage

import android.content.Context
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.model.CapturedDestination
import org.json.JSONArray
import java.util.Locale
import java.util.UUID

class AddressMemoStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val legacyMemoStore = PlaceMemoStore(context)

    fun load(): List<AddressMemoEntry> {
        val raw = preferences.getString(KEY_ENTRIES, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    add(AddressMemoEntry.fromJson(array.getJSONObject(index)))
                }
            }.sortedByDescending { it.updatedAt }
        }.getOrDefault(emptyList())
    }

    fun findById(id: String): AddressMemoEntry? = load().firstOrNull { it.id == id }

    fun findForCapture(capture: CapturedDestination): AddressMemoEntry? {
        val placeKey = PlaceKeyFactory.create(
            latitude = capture.latitude,
            longitude = capture.longitude,
            destinationName = capture.destinationName,
            rawUri = capture.rawUri,
        )
        return load().firstOrNull { it.placeKey == placeKey }
    }

    fun ensureForCapture(capture: CapturedDestination): AddressMemoEntry {
        findForCapture(capture)?.let { existing ->
            val updated = existing.copy(
                placeName = existing.placeName.ifBlank { capture.destinationName.trim() },
                latitude = capture.latitude ?: existing.latitude,
                longitude = capture.longitude ?: existing.longitude,
            )
            if (updated != existing) save(updated)
            return updated
        }

        val now = System.currentTimeMillis()
        val placeKey = PlaceKeyFactory.create(
            latitude = capture.latitude,
            longitude = capture.longitude,
            destinationName = capture.destinationName,
            rawUri = capture.rawUri,
        )
        val entry = AddressMemoEntry(
            id = UUID.randomUUID().toString(),
            placeKey = placeKey,
            placeName = capture.destinationName.trim(),
            address = capture.destinationName.trim(),
            roadAddress = "",
            memo = legacyMemoStore.get(capture),
            latitude = capture.latitude,
            longitude = capture.longitude,
            createdAt = now,
            updatedAt = now,
        )
        save(entry)
        return entry
    }

    fun createBlank(): AddressMemoEntry {
        val now = System.currentTimeMillis()
        return AddressMemoEntry(
            id = UUID.randomUUID().toString(),
            placeKey = "draft:${UUID.randomUUID()}",
            placeName = "",
            address = "",
            roadAddress = "",
            memo = "",
            latitude = null,
            longitude = null,
            createdAt = now,
            updatedAt = now,
        )
    }

    fun save(entry: AddressMemoEntry): AddressMemoEntry {
        val normalized = entry.copy(
            placeName = entry.placeName.trim().take(MAX_TEXT_LENGTH),
            address = entry.address.trim().take(MAX_TEXT_LENGTH),
            roadAddress = entry.roadAddress.trim().take(MAX_TEXT_LENGTH),
            memo = entry.memo.trim().take(MAX_MEMO_LENGTH),
            placeKey = buildStablePlaceKey(entry),
            updatedAt = System.currentTimeMillis(),
        )
        val items = load().filterNot { it.id == normalized.id }.toMutableList()
        items.add(0, normalized)
        persist(items.take(MAX_ENTRIES))
        return normalized
    }

    fun delete(id: String) {
        persist(load().filterNot { it.id == id })
    }

    fun search(query: String): List<AddressMemoEntry> {
        val needle = normalize(query)
        if (needle.isBlank()) return load()
        return load().filter { entry ->
            listOf(entry.placeName, entry.address, entry.roadAddress, entry.memo)
                .any { normalize(it).contains(needle) }
        }
    }

    private fun buildStablePlaceKey(entry: AddressMemoEntry): String {
        if (entry.latitude != null && entry.longitude != null) {
            return PlaceKeyFactory.create(
                latitude = entry.latitude,
                longitude = entry.longitude,
                destinationName = entry.placeName,
                rawUri = "",
            )
        }
        val addressKey = normalize(entry.roadAddress.ifBlank { entry.address.ifBlank { entry.placeName } })
        return if (addressKey.isBlank()) entry.placeKey else "address:$addressKey"
    }

    private fun persist(items: List<AddressMemoEntry>) {
        val array = JSONArray()
        items.forEach { array.put(it.toJson()) }
        preferences.edit().putString(KEY_ENTRIES, array.toString()).apply()
    }

    private fun normalize(value: String): String = value
        .trim()
        .lowercase(Locale.ROOT)
        .replace(WHITESPACE, " ")

    companion object {
        private const val PREFERENCES_NAME = "address_memos"
        private const val KEY_ENTRIES = "entries"
        private const val MAX_ENTRIES = 500
        private const val MAX_TEXT_LENGTH = 250
        private const val MAX_MEMO_LENGTH = 1000
        private val WHITESPACE = Regex("\\s+")
    }
}
