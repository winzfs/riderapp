package com.winzfs.navcapture.overlay

import org.junit.Assert.assertEquals
import org.junit.Test

class DestinationOverlayFormatterTest {
    @Test
    fun `shows only address after city and district`() {
        val result = DestinationOverlayFormatter.format(
            sourceText = "광주광역시 광산구 임방울대로 123 수완센트럴아파트 101동 1001호",
            sourcePayloadText = "[Extras] 없음",
            referenceRoadAddress = "",
        )

        assertEquals("임방울대로 123", result.primaryAddress)
        assertEquals("수완센트럴아파트", result.buildingName)
        assertEquals("101동 1001호", result.unitDetail)
    }

    @Test
    fun `reads building dong and ho from separate delivery extras`() {
        val result = DestinationOverlayFormatter.format(
            sourceText = "광주광역시 광산구 수완로 10",
            sourcePayloadText = """
                [Extras]
                buildingName = 수완대방노블랜드6차
                dong = 105
                ho = 1203
            """.trimIndent(),
            referenceRoadAddress = "",
        )

        assertEquals("수완로 10", result.primaryAddress)
        assertEquals("수완대방노블랜드6차", result.buildingName)
        assertEquals("105동 1203호", result.unitDetail)
    }

    @Test
    fun `uses reference road address only when source has no address`() {
        val result = DestinationOverlayFormatter.format(
            sourceText = "수완센트럴아파트 101동 1001호",
            sourcePayloadText = "[Extras] 없음",
            referenceRoadAddress = "광주광역시 광산구 임방울대로 123",
        )

        assertEquals("임방울대로 123", result.primaryAddress)
        assertEquals("수완센트럴아파트", result.buildingName)
        assertEquals("101동 1001호", result.unitDetail)
    }

    @Test
    fun `removes province city and district prefixes`() {
        assertEquals(
            "망포로 10",
            DestinationOverlayFormatter.stripAdministrativePrefix(
                "경기도 수원시 영통구 망포로 10",
            ),
        )
    }
}
