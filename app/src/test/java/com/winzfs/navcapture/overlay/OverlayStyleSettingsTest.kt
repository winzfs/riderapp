package com.winzfs.navcapture.overlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OverlayStyleSettingsTest {
    @Test
    fun hexColorsAcceptHashAndNormalizeCase() {
        assertEquals(0x1B1F27, OverlayStyleSettings.parseHex("#1b1f27"))
        assertEquals(0xFFFFFF, OverlayStyleSettings.parseHex("FFFFFF"))
        assertEquals("#FFDC8E", OverlayStyleSettings.formatHex(0xFFDC8E))
    }

    @Test
    fun invalidHexColorsAreRejected() {
        assertNull(OverlayStyleSettings.parseHex("#FFF"))
        assertNull(OverlayStyleSettings.parseHex("#GGGGGG"))
        assertNull(OverlayStyleSettings.parseHex("12345678"))
    }

    @Test
    fun alphaIsClampedAndCombinedWithRgb() {
        assertEquals(0xFF123456.toInt(), OverlayStyleSettings.argb(0x123456, 100))
        assertEquals(0x00123456, OverlayStyleSettings.argb(0x123456, -20))
    }

    @Test
    fun backgroundCanBeInvisibleWhileTextRemainsOpaque() {
        val normalized = OverlayStyleSettings.normalize(
            OverlayStyleSettings.defaultStyle.copy(
                backgroundOpacityPercent = 0,
                textOpacityPercent = 100,
            ),
        )
        assertEquals(0, normalized.backgroundOpacityPercent)
        assertEquals(100, normalized.textOpacityPercent)
        assertEquals(0x001B1F27, OverlayStyleSettings.argb(normalized.backgroundColor, normalized.backgroundOpacityPercent))
        assertEquals(0xFFFFFFFF.toInt(), OverlayStyleSettings.argb(normalized.primaryTextColor, normalized.textOpacityPercent))
    }

    @Test
    fun textOutlineValuesAreClamped() {
        val normalized = OverlayStyleSettings.normalize(
            OverlayStyleSettings.defaultStyle.copy(
                textOutlineWidthDp = 99,
                textOutlineOpacityPercent = -10,
                textOpacityPercent = 0,
            ),
        )
        assertEquals(OverlayStyleSettings.MAX_TEXT_OUTLINE_WIDTH_DP, normalized.textOutlineWidthDp)
        assertEquals(0, normalized.textOutlineOpacityPercent)
        assertEquals(OverlayStyleSettings.MIN_TEXT_OPACITY_PERCENT, normalized.textOpacityPercent)
    }
}
