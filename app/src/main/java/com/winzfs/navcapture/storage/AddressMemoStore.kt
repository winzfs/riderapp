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

    /**
     * Creates or refreshes the memo entry for a delivery destination.
     * Only exact delivery-app source fields and original coordinates are refreshed here.
     * Geocoded/reference addresses never replace delivery-app data.
     */
    fun ensureForCapture(capture: CapturedDestination): AddressMemoEntry {
        val incomingSource = capture.destinationName
        val incomingPayload = capture.extrasText

        findForCapture(capture)?.let { existing ->
            val updated = existing.copy(
                sourceText = incomingSource.ifBlank { existing.sourceText },
                sourcePayloadText = incomingPayload.ifBlank { existing.sourcePayloadText },
                latitude = capture.latitude ?: existing.latitude,
                longitude = capture.longitude ?: existing.longitude,
            )
            if (updated != existing) return save(updated)
            return existing
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
            sourceText = incomingSource,
            sourcePayloadText = incomingPayload,
            placeName = "",
            address = "",
            roadAddress = "",
            unitDetail = "",
            roadAddressConfirmed = false,
            memo = legacyMemoStore.get(capture),
            latitude = capture.latitude,
            longitude = capture.longitude,
            createdAt = now,
            updatedAt = now,
        )
        return save(entry)
    }

    fun createBlank(): AddressMemoEntry {
        val now = System.currentTimeMillis()
        return AddressMemoEntry(
            id = UUID.randomUUID().toString(),
            placeKey = "draft:${UUID.randomUUID()}",
            sourceText = "",
            sourcePayloadText = "",
            placeName = "",
            address = "",
            roadAddress = "",
            unitDetail = "",
            roadAddressConfirmed = false,
            memo = "",
            latitude = null,
            longitude = null,
            createdAt = now,
            updatedAt = now,
        )
    }

    fun save(entry: AddressMemoEntry): AddressMemoEntry {
        val normalized = entry.copy(
            sourceText = entry.sourceText.replace("\u0000", "").take(MAX_SOURCE_LENGTH),
            sourcePayloadText = entry.sourcePayloadText.replace("\u0000", "").take(MAX_PAYLOAD_LENGTH),
            placeName = entry.placeName.trim().take(MAX_TEXT_LENGTH),
            address = entry.address.trim().take(MAX_TEXT_LENGTH),
            roadAddress = entry.roadAddress.trim().take(MAX_TEXT_LENGTH),
            unitDetail = entry.unitDetail.trim().take(MAX_DETAIL_LENGTH),
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
            listOf(
                entry.sourceText,
                entry.sourcePayloadText,
                entry.placeName,
                entry.address,
                entry.roadAddress,
                entry.unitDetail,
                entry.memo,
            ).any { normalize(it).contains(needle) }
        }
    }

    private fun buildStablePlaceKey(entry: AddressMemoEntry): String {
        if (entry.latitude != null && entry.longitude != null) {
            return PlaceKeyFactory.create(
                latitude = entry.latitude,
                longitude = entry.longitude,
                destinationName = entry.sourceText.ifBlank { entry.placeName },
                rawUri = "",
            )
        }
        val addressKey = normalize(
            entry.roadAddress.ifBlank {
                entry.address.ifBlank {
                    entry.placeName.ifBlank { entry.sourceText }
                }
            },
        )
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
        private const val MAX_SOURCE_LENGTH = 1000
        private const val MAX_PAYLOAD_LENGTH = 12_000
        private const val MAX_TEXT_LENGTH = 250
        private const val MAX_DETAIL_LENGTH = 100
        private const val MAX_MEMO_LENGTH = 1000
        private val WHITESPACE = Regex("\\s+")
    }
}
