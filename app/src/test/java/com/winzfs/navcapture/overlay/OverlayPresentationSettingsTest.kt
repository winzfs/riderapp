package com.winzfs.navcapture.overlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayPresentationSettingsTest {
    @Test
    fun defaultPresentationUsesCardAndDetailedSystemNotification() {
        val defaults = OverlayPresentationSettings.defaultPresentation
        assertEquals(OverlayPresentationMode.CARD, defaults.mode)
        assertTrue(defaults.showDetailedNotification)
        assertTrue(defaults.showHeadsUpNotification)
    }

    @Test
    fun presentationModesRemainStableForPersistence() {
        assertEquals("CARD", OverlayPresentationMode.CARD.name)
        assertEquals("TOP_TICKER", OverlayPresentationMode.TOP_TICKER.name)
    }
}
