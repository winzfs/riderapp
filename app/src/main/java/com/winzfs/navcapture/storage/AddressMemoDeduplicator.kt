package com.winzfs.navcapture.storage

import com.winzfs.navcapture.model.AddressMemoEntry

/** Collapses legacy duplicate entries into one entry per canonical address. */
object AddressMemoDeduplicator {
    fun deduplicate(entries: List<AddressMemoEntry>): List<AddressMemoEntry> {
        if (entries.size < 2) {
            return entries.map { entry ->
                val key = AddressMemoIdentity.forEntry(entry)
                if (entry.placeKey == key) entry else entry.copy(placeKey = key)
            }
        }

        val merged = linkedMapOf<String, AddressMemoEntry>()
        entries.sortedByDescending(AddressMemoEntry::updatedAt).forEach { rawEntry ->
            val key = AddressMemoIdentity.forEntry(rawEntry)
            val entry = if (rawEntry.placeKey == key) rawEntry else rawEntry.copy(placeKey = key)
            val current = merged[key]
            merged[key] = if (current == null) entry else merge(current, entry)
        }
        return merged.values.sortedByDescending(AddressMemoEntry::updatedAt)
    }

    fun merge(primary: AddressMemoEntry, secondary: AddressMemoEntry): AddressMemoEntry {
        val primaryRoadWins = primary.roadAddressConfirmed || !secondary.roadAddressConfirmed
        return primary.copy(
            placeKey = AddressMemoIdentity.forEntry(primary),
            sourceText = primary.sourceText.ifBlank { secondary.sourceText },
            sourcePayloadText = primary.sourcePayloadText.ifBlank { secondary.sourcePayloadText },
            placeName = primary.placeName.ifBlank { secondary.placeName },
            address = primary.address.ifBlank { secondary.address },
            roadAddress = if (primaryRoadWins) {
                primary.roadAddress.ifBlank { secondary.roadAddress }
            } else {
                secondary.roadAddress.ifBlank { primary.roadAddress }
            },
            unitDetail = primary.unitDetail.ifBlank { secondary.unitDetail },
            roadAddressConfirmed = primary.roadAddressConfirmed || secondary.roadAddressConfirmed,
            memo = primary.memo.ifBlank { secondary.memo },
            latitude = primary.latitude ?: secondary.latitude,
            longitude = primary.longitude ?: secondary.longitude,
            createdAt = minOf(primary.createdAt, secondary.createdAt),
            updatedAt = maxOf(primary.updatedAt, secondary.updatedAt),
        )
    }
}
