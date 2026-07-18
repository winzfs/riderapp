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
        val decoded = runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    add(AddressMemoEntry.fromJson(array.getJSONObject(index)))
                }
            }.sortedByDescending { it.updatedAt }
        }.getOrDefault(emptyList())

        val deduplicated = AddressMemoDeduplicator.deduplicate(decoded)
        if (deduplicated != decoded) persist(deduplicated)
        return deduplicated
    }

    fun findById(id: String): AddressMemoEntry? = load().firstOrNull { it.id == id }

    fun findForCapture(capture: CapturedDestination): AddressMemoEntry? {
        val entries = load()
        val identity = AddressMemoIdentity.forCapture(capture)
        entries.firstOrNull { AddressMemoIdentity.forEntry(it) == identity }?.let { return it }

        // Some delivery apps provide only a place name and move the pin a few metres
        // between calls. Nearby matching is a fallback only when no address identity
        // was available, preventing 1-metre coordinate drift from creating duplicates.
        if (!identity.startsWith("address:")) {
            return entries.firstOrNull { entry ->
                AddressMemoIdentity.isNearby(
                    capture.latitude,
                    capture.longitude,
                    entry.latitude,
                    entry.longitude,
                )
            }
        }
        return null
    }

    /**
     * Creates or refreshes the single memo entry for a delivery address.
     * Exact delivery-app source fields remain untouched; only the local identity
     * used to find the memo is normalized.
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
        val entry = AddressMemoEntry(
            id = UUID.randomUUID().toString(),
            placeKey = AddressMemoIdentity.forCapture(capture),
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
        val sanitized = entry.copy(
            sourceText = entry.sourceText.replace("\u0000", "").take(MAX_SOURCE_LENGTH),
            sourcePayloadText = entry.sourcePayloadText.replace("\u0000", "").take(MAX_PAYLOAD_LENGTH),
            placeName = entry.placeName.trim().take(MAX_TEXT_LENGTH),
            address = entry.address.trim().take(MAX_TEXT_LENGTH),
            roadAddress = entry.roadAddress.trim().take(MAX_TEXT_LENGTH),
            unitDetail = entry.unitDetail.trim().take(MAX_DETAIL_LENGTH),
            memo = entry.memo.trim().take(MAX_MEMO_LENGTH),
        )
        val identity = AddressMemoIdentity.forEntry(sanitized)
        val items = load()
        val sameAddress = items.firstOrNull { existing ->
            existing.id != sanitized.id && AddressMemoIdentity.forEntry(existing) == identity
        }

        val normalized = if (sameAddress == null) {
            sanitized.copy(
                placeKey = identity,
                updatedAt = System.currentTimeMillis(),
            )
        } else {
            AddressMemoDeduplicator.merge(
                primary = sanitized.copy(
                    id = sameAddress.id,
                    placeKey = identity,
                    createdAt = minOf(sanitized.createdAt, sameAddress.createdAt),
                    updatedAt = System.currentTimeMillis(),
                ),
                secondary = sameAddress,
            ).copy(
                placeKey = identity,
                updatedAt = System.currentTimeMillis(),
            )
        }

        val remaining = items.filterNot { existing ->
            existing.id == normalized.id ||
                existing.id == sanitized.id ||
                AddressMemoIdentity.forEntry(existing) == identity
        }.toMutableList()
        remaining.add(0, normalized)
        persist(remaining.take(MAX_ENTRIES))
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
