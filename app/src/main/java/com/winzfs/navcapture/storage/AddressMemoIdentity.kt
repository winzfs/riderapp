package com.winzfs.navcapture.storage

import com.winzfs.navcapture.address.KoreanAddressTextParser
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.model.CapturedDestination
import java.text.Normalizer
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Builds an address-level identity for personal memos.
 *
 * Whitespace and harmless punctuation never create a second memo. Apartment
 * dong/ho details are intentionally excluded because a memo belongs to the
 * street/lot address, not to an individual delivery unit.
 */
object AddressMemoIdentity {
    fun forCapture(capture: CapturedDestination): String {
        val parsed = KoreanAddressTextParser.parse(
            destinationName = capture.destinationName,
            payloadText = capture.extrasText,
        )
        val sourceAddress = parsed.roadAddress.ifBlank { parsed.lotAddress }
        addressKey(sourceAddress)?.let { return it }

        coordinateKey(capture.latitude, capture.longitude)?.let { return it }

        val name = canonicalText(
            KoreanAddressTextParser.searchQuery(capture.destinationName),
        )
        if (name.isNotBlank()) return "name:$name"
        return "uri:${capture.rawUri.hashCode()}"
    }

    fun forEntry(entry: AddressMemoEntry): String {
        val explicitAddress = entry.roadAddress.ifBlank { entry.address }
        addressKey(explicitAddress)?.let { return it }

        val parsed = KoreanAddressTextParser.parse(
            destinationName = entry.sourceText,
            payloadText = entry.sourcePayloadText,
        )
        val sourceAddress = parsed.roadAddress.ifBlank { parsed.lotAddress }
        addressKey(sourceAddress)?.let { return it }

        coordinateKey(entry.latitude, entry.longitude)?.let { return it }

        val name = canonicalText(
            entry.placeName.ifBlank {
                KoreanAddressTextParser.searchQuery(entry.sourceText)
            },
        )
        if (name.isNotBlank()) return "name:$name"
        return entry.placeKey.ifBlank { "entry:${entry.id}" }
    }

    fun canonicalAddress(value: String): String {
        val normalized = Normalizer.normalize(value, Normalizer.Form.NFKC)
            .lowercase(Locale.ROOT)
            .replace(UNIT_DETAIL, " ")
            .replace(ROAD_SEGMENT_SPACING, "$1번길")
            .replace(ADDRESS_NOISE, "")
            .trim()
        return normalized
    }

    fun isNearby(
        firstLatitude: Double?,
        firstLongitude: Double?,
        secondLatitude: Double?,
        secondLongitude: Double?,
        thresholdMeters: Double = NEARBY_THRESHOLD_METERS,
    ): Boolean {
        if (
            firstLatitude == null || firstLongitude == null ||
            secondLatitude == null || secondLongitude == null
        ) return false
        return distanceMeters(
            firstLatitude,
            firstLongitude,
            secondLatitude,
            secondLongitude,
        ) <= thresholdMeters
    }

    private fun addressKey(value: String): String? {
        val canonical = canonicalAddress(value)
        return canonical.takeIf(String::isNotBlank)?.let { "address:$it" }
    }

    private fun coordinateKey(latitude: Double?, longitude: Double?): String? {
        if (latitude == null || longitude == null) return null
        val latCell = kotlin.math.round(latitude * COORDINATE_SCALE).toLong()
        val lngCell = kotlin.math.round(longitude * COORDINATE_SCALE).toLong()
        return "coord:$latCell:$lngCell"
    }

    private fun canonicalText(value: String): String = Normalizer
        .normalize(value, Normalizer.Form.NFKC)
        .lowercase(Locale.ROOT)
        .replace(UNIT_DETAIL, " ")
        .replace(TEXT_NOISE, "")
        .trim()

    private fun distanceMeters(
        firstLatitude: Double,
        firstLongitude: Double,
        secondLatitude: Double,
        secondLongitude: Double,
    ): Double {
        val lat1 = Math.toRadians(firstLatitude)
        val lat2 = Math.toRadians(secondLatitude)
        val deltaLat = Math.toRadians(secondLatitude - firstLatitude)
        val deltaLng = Math.toRadians(secondLongitude - firstLongitude)
        val a = sin(deltaLat / 2) * sin(deltaLat / 2) +
            cos(lat1) * cos(lat2) * sin(deltaLng / 2) * sin(deltaLng / 2)
        return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    private const val COORDINATE_SCALE = 10_000.0
    private const val NEARBY_THRESHOLD_METERS = 25.0
    private const val EARTH_RADIUS_METERS = 6_371_000.0

    private val ROAD_SEGMENT_SPACING = Regex("(\\d+)\\s*번\\s*길")
    private val UNIT_DETAIL = Regex(
        "(?<![가-힣A-Za-z0-9])(?:제\\s*)?(?:[A-Za-z]|\\d{1,5})\\s*(?:동|호|층)(?![가-힣])",
    )
    private val ADDRESS_NOISE = Regex("[^0-9a-z가-힣·-]")
    private val TEXT_NOISE = Regex("[^0-9a-z가-힣·-]")
}
