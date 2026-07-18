package com.winzfs.navcapture.overlay

import org.junit.Assert.assertEquals
import org.junit.Test

class OverlaySizePolicyTest {
    @Test
    fun widthAndHeightAdjustIndependently() {
        val wider = OverlaySizePolicy.adjust(
            currentWidthDp = 320,
            currentHeightDp = 280,
            widthDeltaDp = OverlaySizePolicy.WIDTH_STEP_DP,
            heightDeltaDp = 0,
            maxWidthDp = 400,
            maxHeightDp = 600,
        )
        val shorter = OverlaySizePolicy.adjust(
            currentWidthDp = wider.widthDp,
            currentHeightDp = wider.heightDp,
            widthDeltaDp = 0,
            heightDeltaDp = -OverlaySizePolicy.HEIGHT_STEP_DP,
            maxWidthDp = 400,
            maxHeightDp = 600,
        )

        assertEquals(330, wider.widthDp)
        assertEquals(280, wider.heightDp)
        assertEquals(330, shorter.widthDp)
        assertEquals(270, shorter.heightDp)
    }

    @Test
    fun sizeIsClampedToCompactMinimumAndPhoneBounds() {
        val minimum = OverlaySizePolicy.adjust(
            currentWidthDp = 180,
            currentHeightDp = 110,
            widthDeltaDp = -200,
            heightDeltaDp = -200,
            maxWidthDp = 360,
            maxHeightDp = 700,
        )
        val maximum = OverlaySizePolicy.adjust(
            currentWidthDp = 350,
            currentHeightDp = 690,
            widthDeltaDp = 200,
            heightDeltaDp = 200,
            maxWidthDp = 360,
            maxHeightDp = 700,
        )

        assertEquals(OverlaySize(180, 110), minimum)
        assertEquals(OverlaySize(360, 700), maximum)
    }

    @Test
    fun storedSizeIsNormalizedForSmallerScreen() {
        val normalized = OverlaySizePolicy.normalizeStored(
            widthDp = 500,
            heightDp = 900,
            maxWidthDp = 344,
            maxHeightDp = 640,
        )

        assertEquals(OverlaySize(344, 640), normalized)
    }
}
