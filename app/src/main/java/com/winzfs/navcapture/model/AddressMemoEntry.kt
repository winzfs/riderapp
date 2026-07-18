package com.winzfs.navcapture.model

import org.json.JSONObject

data class AddressMemoEntry(
    val id: String,
    val placeKey: String,
    /** Exact destination text received from the delivery app. Never rewritten by geocoding. */
    val sourceText: String,
    /** Exact extras/ClipData snapshot received from the delivery app. */
    val sourcePayloadText: String,
    /** Optional user-defined display name. */
    val placeName: String,
    /** Legacy/manual address field retained for backward compatibility. */
    val address: String,
    /** Optional reference road address. Never used for navigation forwarding. */
    val roadAddress: String,
    /** Legacy/manual detail field retained for backward compatibility. */
    val unitDetail: String,
    val roadAddressConfirmed: Boolean,
    val memo: String,
    val latitude: Double?,
    val longitude: Double?,
    val createdAt: Long,
    val updatedAt: Long,
) {
    val title: String
        get() = sourceText.ifBlank {
            placeName.ifBlank {
                roadAddress.ifBlank {
                    address.ifBlank { "주소 미입력" }
                }
            }
        }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("placeKey", placeKey)
        put("sourceText", sourceText)
        put("sourcePayloadText", sourcePayloadText)
        put("placeName", placeName)
        put("address", address)
        put("roadAddress", roadAddress)
        put("unitDetail", unitDetail)
        put("roadAddressConfirmed", roadAddressConfirmed)
        put("memo", memo)
        put("latitude", latitude ?: JSONObject.NULL)
        put("longitude", longitude ?: JSONObject.NULL)
        put("createdAt", createdAt)
        put("updatedAt", updatedAt)
    }

    companion object {
        fun fromJson(json: JSONObject): AddressMemoEntry {
            val legacyPlaceName = json.optString("placeName")
            val legacyAddress = json.optString("address")
            return AddressMemoEntry(
                id = json.optString("id"),
                placeKey = json.optString("placeKey"),
                sourceText = json.optString("sourceText").ifBlank {
                    legacyPlaceName.ifBlank { legacyAddress }
                },
                sourcePayloadText = json.optString("sourcePayloadText"),
                placeName = legacyPlaceName,
                address = legacyAddress,
                roadAddress = json.optString("roadAddress"),
                unitDetail = json.optString("unitDetail"),
                roadAddressConfirmed = json.optBoolean("roadAddressConfirmed", false),
                memo = json.optString("memo"),
                latitude = json.optNullableDouble("latitude"),
                longitude = json.optNullableDouble("longitude"),
                createdAt = json.optLong("createdAt"),
                updatedAt = json.optLong("updatedAt"),
            )
        }

        private fun JSONObject.optNullableDouble(key: String): Double? {
            if (!has(key) || isNull(key)) return null
            return optDouble(key).takeUnless { it.isNaN() }
        }
    }
}
