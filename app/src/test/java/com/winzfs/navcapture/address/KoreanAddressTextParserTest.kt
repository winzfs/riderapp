package com.winzfs.navcapture.address

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KoreanAddressTextParserTest {
    @Test
    fun prefersRoadAddressFromDeliveryPayload() {
        val result = KoreanAddressTextParser.parse(
            destinationName = "수완센트럴아파트 101동 1001호",
            payloadText = """
                destinationAddress = 광주광역시 광산구 임방울대로 123 101동 1001호
                jibunAddress = 광주광역시 광산구 수완동 1000
            """.trimIndent(),
        )

        assertEquals("광주광역시 광산구 임방울대로 123", result.roadAddress)
        assertEquals("광주광역시 광산구 수완동 1000", result.lotAddress)
        assertEquals("101동 1001호", result.unitDetail)
    }

    @Test
    fun administrativeDongIsNotApartmentDong() {
        val result = KoreanAddressTextParser.parse(
            destinationName = "광주광역시 광산구 수완동 1000",
            payloadText = "",
        )

        assertEquals("", result.unitDetail)
        assertFalse(KoreanAddressTextParser.isUnitOnlyFeature("수완동"))
        assertTrue(KoreanAddressTextParser.isUnitOnlyFeature("103동"))
    }

    @Test
    fun removesUnitFromGeocoderSearchQuery() {
        val query = KoreanAddressTextParser.searchQuery("수완센트럴아파트 101동 1001호")

        assertEquals("수완센트럴아파트", query)
    }
}
