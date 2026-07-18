package com.winzfs.navcapture.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RawNavigationUriParserTest {
    private val parser = RawNavigationUriParser()

    @Test
    fun parsesAndroidGeoUriWithLabel() {
        val result = parser.parse(
            "geo:35.1595454,126.8526012?q=35.1595454,126.8526012(광주광역시청)",
        )

        assertEquals("geo", result.scheme)
        assertEquals(35.1595454, result.latitude!!, 0.0000001)
        assertEquals(126.8526012, result.longitude!!, 0.0000001)
        assertEquals("광주광역시청", result.destinationName)
    }

    @Test
    fun parsesKakaoRouteDestination() {
        val result = parser.parse(
            "kakaomap://route?sp=35.1,126.8&ep=35.1595454,126.8526012&by=car",
        )

        assertEquals("route", result.host)
        assertEquals(35.1595454, result.latitude!!, 0.0000001)
        assertEquals(126.8526012, result.longitude!!, 0.0000001)
    }

    @Test
    fun parsesTmapDestination() {
        val result = parser.parse(
            "tmap://route?rGoName=%EA%B4%91%EC%A3%BC%EA%B4%91%EC%97%AD%EC%8B%9C%EC%B2%AD" +
                "&rGoX=126.8526012&rGoY=35.1595454",
        )

        assertEquals("광주광역시청", result.destinationName)
        assertEquals(35.1595454, result.latitude!!, 0.0000001)
        assertEquals(126.8526012, result.longitude!!, 0.0000001)
    }

    @Test
    fun parsesNaverDestination() {
        val result = parser.parse(
            "nmap://navigation?dlat=35.1595454&dlng=126.8526012" +
                "&dname=%EA%B4%91%EC%A3%BC%EA%B4%91%EC%97%AD%EC%8B%9C%EC%B2%AD" +
                "&appname=com.winzfs.navcapture",
        )

        assertEquals("navigation", result.host)
        assertEquals("광주광역시청", result.destinationName)
        assertEquals(35.1595454, result.latitude!!, 0.0000001)
        assertEquals(126.8526012, result.longitude!!, 0.0000001)
    }

    @Test
    fun leavesCoordinatesEmptyForUnknownUri() {
        val result = parser.parse("example://something?value=1")

        assertEquals("example", result.scheme)
        assertNull(result.latitude)
        assertNull(result.longitude)
    }
}
