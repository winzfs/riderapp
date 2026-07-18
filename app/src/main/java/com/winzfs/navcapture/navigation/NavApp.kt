package com.winzfs.navcapture.navigation

enum class NavApp(
    val label: String,
    val packageName: String?,
) {
    AUTO("원래 네비 자동 감지", null),
    KAKAO_NAVI("카카오내비", "com.locnall.KimGiSa"),
    KAKAO_MAP("카카오맵", "net.daum.android.map"),
    TMAP("티맵", "com.skt.tmap.ku"),
    NAVER("네이버지도", "com.nhn.android.nmap"),
    ;

    override fun toString(): String = label

    companion object {
        fun fromStored(value: String?): NavApp = when (value) {
            "KAKAO" -> KAKAO_MAP // migrate v0.1 setting
            else -> entries.firstOrNull { it.name == value } ?: AUTO
        }
    }
}
