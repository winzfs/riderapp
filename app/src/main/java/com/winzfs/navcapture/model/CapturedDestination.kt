package com.winzfs.navcapture.model

import org.json.JSONObject

data class CapturedDestination(
    val capturedAt: Long,
    val action: String,
    val rawUri: String,
    val scheme: String,
    val host: String,
    val path: String,
    val latitude: Double?,
    val longitude: Double?,
    val destinationName: String,
    val format: String,
    val extrasText: String,
    val flags: Int,
    val categories: String,
) {
    val hasCoordinates: Boolean
        get() = latitude != null && longitude != null

    fun toJson(): JSONObject = JSONObject().apply {
        put("capturedAt", capturedAt)
        put("action", action)
        put("rawUri", rawUri)
        put("scheme", scheme)
        put("host", host)
        put("path", path)
        put("latitude", latitude ?: JSONObject.NULL)
        put("longitude", longitude ?: JSONObject.NULL)
        put("destinationName", destinationName)
        put("format", format)
        put("extrasText", extrasText)
        put("flags", flags)
        put("categories", categories)
    }

    companion object {
        fun fromJson(json: JSONObject): CapturedDestination = CapturedDestination(
            capturedAt = json.optLong("capturedAt"),
            action = json.optString("action"),
            rawUri = json.optString("rawUri"),
            scheme = json.optString("scheme"),
            host = json.optString("host"),
            path = json.optString("path"),
            latitude = json.optNullableDouble("latitude"),
            longitude = json.optNullableDouble("longitude"),
            destinationName = json.optString("destinationName"),
            format = json.optString("format"),
            extrasText = json.optString("extrasText"),
            flags = json.optInt("flags"),
            categories = json.optString("categories"),
        )

        private fun JSONObject.optNullableDouble(key: String): Double? {
            if (!has(key) || isNull(key)) return null
            return optDouble(key).takeUnless { it.isNaN() }
        }
    }
}
