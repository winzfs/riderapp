package com.winzfs.navcapture.navigation

import com.winzfs.navcapture.model.CapturedDestination
import java.util.Locale

/**
 * Detects which navigation app the delivery app originally targeted.
 *
 * This only inspects the original URI scheme and untouched payload text. It never
 * changes the destination name, coordinates, URI or address.
 */
object SourceNavigationDetector {
    fun detect(capture: CapturedDestination): NavApp? = detect(
        scheme = capture.scheme,
        host = capture.host,
        rawUri = capture.rawUri,
        payloadText = capture.extrasText,
    )

    fun detect(
        scheme: String,
        host: String = "",
        rawUri: String = "",
        payloadText: String = "",
    ): NavApp? {
        val normalizedScheme = scheme.trim().lowercase(Locale.ROOT)
        val normalizedHost = host.trim().lowercase(Locale.ROOT)

        when (normalizedScheme) {
            "kakaonavi-sdk" -> return NavApp.KAKAO_NAVI
            "kakaomap" -> return NavApp.KAKAO_MAP
            "tmap" -> return NavApp.TMAP
            "nmap" -> return NavApp.NAVER
            "google.navigation", "googlemaps" -> return NavApp.GOOGLE_MAPS
            "http", "https" -> {
                if (normalizedHost == "m.map.kakao.com" || normalizedHost.endsWith(".map.kakao.com")) {
                    return NavApp.KAKAO_MAP
                }
            }
        }

        val haystack = "$rawUri\n$payloadText".lowercase(Locale.ROOT)
        return MARKERS.firstOrNull { marker -> marker.values.any(haystack::contains) }?.app
    }

    private data class Marker(val app: NavApp, val values: List<String>)

    private val MARKERS = listOf(
        Marker(
            NavApp.KAKAO_NAVI,
            listOf(
                "com.locnall.kimgisa",
                "kakaonavi-sdk:",
                "kakaonavi",
                "카카오내비",
            ),
        ),
        Marker(
            NavApp.KAKAO_MAP,
            listOf(
                "net.daum.android.map",
                "kakaomap:",
                "m.map.kakao.com/scheme",
                "카카오맵",
            ),
        ),
        Marker(
            NavApp.TMAP,
            listOf(
                "com.skt.tmap.ku",
                "com.skt.skaf.l001mtm091",
                "tmap:",
                "티맵",
            ),
        ),
        Marker(
            NavApp.NAVER,
            listOf(
                "com.nhn.android.nmap",
                "nmap:",
                "네이버지도",
                "네이버 지도",
            ),
        ),
        Marker(
            NavApp.GOOGLE_MAPS,
            listOf(
                "com.google.android.apps.maps",
                "google.navigation:",
                "googlemaps:",
                "구글지도",
                "구글 지도",
            ),
        ),
    )
}
