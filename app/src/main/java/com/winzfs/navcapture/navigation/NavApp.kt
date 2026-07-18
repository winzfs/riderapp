package com.winzfs.navcapture.navigation

enum class NavApp(
    val label: String,
    val packageName: String?,
) {
    AUTO("원래 네비 자동 감지", null),
    KAKAO("카카오맵", "net.daum.android.map"),
    TMAP("티맵", "com.skt.tmap.ku"),
    NAVER("네이버지도", "com.nhn.android.nmap"),
    ;

    override fun toString(): String = label

    companion object {
        fun fromStored(value: String?): NavApp =
            entries.firstOrNull { it.name == value } ?: AUTO
    }
}
