package com.winzfs.navcapture.navigation

enum class NavApp(
    val label: String,
    val packageNames: List<String>,
) {
    MATCH_DELIVERY_APP("배달앱 설정 자동 (권장)", emptyList()),
    PICK_EACH_TIME("매번 지도앱 선택", emptyList()),
    KAKAO_NAVI("카카오내비", listOf("com.locnall.KimGiSa")),
    KAKAO_MAP("카카오맵", listOf("net.daum.android.map")),
    TMAP(
        "티맵",
        listOf(
            "com.skt.tmap.ku",
            "com.skt.skaf.l001mtm091",
        ),
    ),
    NAVER("네이버지도", listOf("com.nhn.android.nmap")),
    GOOGLE_MAPS("구글지도", listOf("com.google.android.apps.maps")),
    ;

    override fun toString(): String = label

    companion object {
        fun fromStored(value: String?): NavApp = when (value) {
            null, "AUTO", "KAKAO" -> MATCH_DELIVERY_APP
            else -> entries.firstOrNull { it.name == value } ?: MATCH_DELIVERY_APP
        }
    }
}
