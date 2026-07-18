package com.winzfs.navcapture.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RawNavigationPayloadParserTest {
    private val parser = RawNavigationPayloadParser()

    @Test
    fun parsesDestinationFromExplicitIntentExtras() {
        val result = parser.parse(
            rawUri = "",
            extras = mapOf(
                "destinationName" to "광주광역시청",
                "destinationX" to "126.8526012",
                "destinationY" to "35.1595454",
            ),
            clipTexts = emptyList(),
        )

        assertEquals("광주광역시청", result.parsed.destinationName)
        assertEquals(35.1595454, result.parsed.latitude!!, 0.0000001)
        assertEquals(126.8526012, result.parsed.longitude!!, 0.0000001)
        assertEquals("Intent extras", result.source)
    }

    @Test
    fun parsesNestedBundleStyleText() {
        val result = parser.parse(
            rawUri = "",
            extras = mapOf(
                "route" to "Bundle[{goalName=수완센트럴병원, goalX=126.824567, goalY=35.190123}]",
            ),
            clipTexts = emptyList(),
        )

        assertEquals("수완센트럴병원", result.parsed.destinationName)
        assertEquals(35.190123, result.parsed.latitude!!, 0.0000001)
        assertEquals(126.824567, result.parsed.longitude!!, 0.0000001)
    }

    @Test
    fun preservesCompleteKakaoNaviUriFoundInsideExtra() {
        val uri = "kakaonavi-sdk://navigate?appkey=test-key&apiver=1.0" +
            "&param=%7B%22destination%22%3A%7B%22name%22%3A%22%EA%B4%91%EC%A3%BC%EC%8B%9C%EC%B2%AD%22%2C%22x%22%3A126.8526012%2C%22y%22%3A35.1595454%7D%7D"
        val result = parser.parse(
            rawUri = "",
            extras = mapOf("navigationUri" to uri),
            clipTexts = emptyList(),
        )

        assertTrue(result.sourceUri.startsWith("kakaonavi-sdk://navigate"))
        assertEquals("광주시청", result.parsed.destinationName)
        assertEquals(35.1595454, result.parsed.latitude!!, 0.0000001)
        assertEquals(126.8526012, result.parsed.longitude!!, 0.0000001)
    }
}
