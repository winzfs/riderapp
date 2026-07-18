package com.winzfs.navcapture.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SourceNavigationDetectorTest {
    @Test
    fun detectsNavigationAppFromOriginalScheme() {
        assertEquals(
            NavApp.TMAP,
            SourceNavigationDetector.detect(scheme = "tmap"),
        )
        assertEquals(
            NavApp.NAVER,
            SourceNavigationDetector.detect(scheme = "nmap"),
        )
        assertEquals(
            NavApp.KAKAO_NAVI,
            SourceNavigationDetector.detect(scheme = "kakaonavi-sdk"),
        )
    }

    @Test
    fun detectsNavigationAppFromUntouchedExtrasPackage() {
        assertEquals(
            NavApp.TMAP,
            SourceNavigationDetector.detect(
                scheme = "intent-extra",
                payloadText = "navigationPackage = com.skt.tmap.ku",
            ),
        )
        assertEquals(
            NavApp.NAVER,
            SourceNavigationDetector.detect(
                scheme = "intent-extra",
                payloadText = "target = com.nhn.android.nmap",
            ),
        )
    }

    @Test
    fun genericGeoDoesNotGuessNavigationApp() {
        assertNull(
            SourceNavigationDetector.detect(
                scheme = "geo",
                rawUri = "geo:35.1,126.8?q=35.1,126.8",
            ),
        )
    }

    @Test
    fun detectsKakaoMapWebScheme() {
        assertEquals(
            NavApp.KAKAO_MAP,
            SourceNavigationDetector.detect(
                scheme = "https",
                host = "m.map.kakao.com",
                rawUri = "https://m.map.kakao.com/scheme/route",
            ),
        )
    }
}
