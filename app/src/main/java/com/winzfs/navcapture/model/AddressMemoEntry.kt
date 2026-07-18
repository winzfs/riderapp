package com.winzfs.navcapture.model

import org.json.JSONObject

data class AddressMemoEntry(
    val id: String,
    val placeKey: String,
    val placeName: String,
    val address: String,
    val roadAddress: String,
    val memo: String,
    val latitude: Double?,
    val longitude: Double?,
    val createdAt: Long,
    val updatedAt: Long,
) {
    val title: String
        get() = placeName.ifBlank {
            roadAddress.ifBlank {
                address.ifBlank { "주소 미입력" }
            }
        }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("placeKey", placeKey)
        put("placeName", placeName)
        put("address", address)
        put("roadAddress", roadAddress)
        put("memo", memo)
        put("latitude", latitude ?: JSONObject.NULL)
        put("longitude", longitude ?: JSONObject.NULL)
        put("createdAt", createdAt)
        put("updatedAt", updatedAt)
    }

    companion object {
        fun fromJson(json: JSONObject): AddressMemoEntry = AddressMemoEntry(
            id = json.optString("id"),
            placeKey = json.optString("placeKey"),
            placeName = json.optString("placeName"),
            address = json.optString("address"),
            roadAddress = json.optString("roadAddress"),
            memo = json.optString("memo"),
            latitude = json.optNullableDouble("latitude"),
            longitude = json.optNullableDouble("longitude"),
            createdAt = json.optLong("createdAt"),
            updatedAt = json.optLong("updatedAt"),
        )

        private fun JSONObject.optNullableDouble(key: String): Double? {
            if (!has(key) || isNull(key)) return null
            return optDouble(key).takeUnless { it.isNaN() }
        }
    }
}
