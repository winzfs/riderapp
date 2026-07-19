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
}
