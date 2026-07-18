package com.winzfs.navcapture.storage

import java.util.Locale
import kotlin.math.roundToLong

/**
 * Creates a stable local-only key for notes attached to a destination.
 * Coordinates are never shown to the user and are quantized to roughly 1 metre.
 */
object PlaceKeyFactory {
    fun create(
        latitude: Double?,
        longitude: Double?,
        destinationName: String,
        rawUri: String,
    ): String {
        if (latitude != null && longitude != null) {
            val latCell = (latitude * COORDINATE_SCALE).roundToLong()
            val lngCell = (longitude * COORDINATE_SCALE).roundToLong()
            return "coord:$latCell:$lngCell"
        }

        val normalizedName = destinationName
            .trim()
            .lowercase(Locale.ROOT)
            .replace(WHITESPACE, " ")
        if (normalizedName.isNotBlank()) return "name:$normalizedName"

        return "uri:${rawUri.hashCode()}"
    }

    private const val COORDINATE_SCALE = 100_000.0
    private val WHITESPACE = Regex("\\s+")
}
