package com.winzfs.navcapture.model

import org.junit.Assert.assertEquals
import org.junit.Test

class CapturedDestinationRoundTripTest {
    @Test
    fun preservesOriginalNavigationPayloadExactly() {
        val original = CapturedDestination(
            capturedAt = 1_752_836_400_000L,
            action = "android.intent.action.VIEW",
            rawUri = "kakaonavi-sdk://navigate?appkey=delivery-key&apiver=1.0&param=%7Boriginal%7D",
            scheme = "kakaonavi-sdk",
            host = "navigate",
            path = "",
            latitude = 35.1595454,
            longitude = 126.8526012,
            destinationName = "광주 광산구 임방울대로 123 101동 1001호",
            format = "Android Intent extras · Intent extras",
            extrasText = "[Extras]\ndestinationAddress = 광주 광산구 임방울대로 123 101동 1001호\ndestinationX = 126.8526012\ndestinationY = 35.1595454",
            flags = 268_435_456,
            categories = "android.intent.category.DEFAULT",
        )

        val restored = CapturedDestination.fromJson(original.toJson())

        assertEquals(original, restored)
    }
}
