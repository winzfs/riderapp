package com.winzfs.navcapture.navigation

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.winzfs.navcapture.model.CapturedDestination

class NavigationForwarder(private val context: Context) {

    fun forward(capture: CapturedDestination, requestedApp: NavApp): Result<NavApp> = runCatching {
        if (requestedApp == NavApp.PICK_EACH_TIME) {
            launchChooser(capture)
            return@runCatching NavApp.PICK_EACH_TIME
        }

        val candidates = buildCandidateIntents(capture, requestedApp)
        if (candidates.isEmpty()) {
            if (requestedApp == NavApp.KAKAO_NAVI) {
                throw IllegalArgumentException(
                    "카카오내비는 배달앱이 전달한 공식 호출 정보가 있을 때만 직접 연결할 수 있습니다. " +
                        "‘매번 지도앱 선택’에서 티맵·네이버지도·카카오맵을 선택해 주세요.",
                )
            }
            throw IllegalArgumentException("목적지 좌표가 없어 ${requestedApp.label}으로 변환할 수 없습니다.")
        }

        launchFirstAvailable(candidates, requestedApp)
        requestedApp
    }

    private fun launchChooser(capture: CapturedDestination) {
        val packageManager = context.packageManager
        val candidates = NavApp.entries
            .asSequence()
            .filter { it != NavApp.PICK_EACH_TIME }
            .mapNotNull { app ->
                buildCandidateIntents(capture, app)
                    .firstOrNull { it.resolveActivity(packageManager) != null }
            }
            .toList()

        if (candidates.isEmpty()) {
            throw ActivityNotFoundException("사용 가능한 지도 앱을 찾지 못했습니다.")
        }

        val chooser = Intent.createChooser(candidates.first(), "목적지를 열 지도 앱 선택").apply {
            if (candidates.size > 1) {
                putExtra(Intent.EXTRA_INITIAL_INTENTS, candidates.drop(1).toTypedArray())
            }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    private fun launchFirstAvailable(candidates: List<Intent>, app: NavApp) {
        var lastError: Throwable? = null
        for (candidate in candidates) {
            try {
                context.startActivity(candidate)
                return
            } catch (error: ActivityNotFoundException) {
                lastError = error
            } catch (error: SecurityException) {
                lastError = error
            }
        }
        throw IllegalStateException("${app.label} 앱을 열 수 없습니다. 설치 여부를 확인하세요.", lastError)
    }

    private fun buildCandidateIntents(
        capture: CapturedDestination,
        app: NavApp,
    ): List<Intent> {
        val uris = buildUris(capture, app)
        if (uris.isEmpty()) return emptyList()

        return app.packageNames.flatMap { packageName ->
            uris.map { uri ->
                Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
        }
    }

    private fun buildUris(capture: CapturedDestination, app: NavApp): List<Uri> {
        val result = mutableListOf<Uri>()
        val originalScheme = capture.scheme.lowercase()
        val originalMatches = when (app) {
            NavApp.KAKAO_NAVI -> originalScheme == "kakaonavi-sdk"
            NavApp.KAKAO_MAP -> originalScheme == "kakaomap"
            NavApp.TMAP -> originalScheme == "tmap"
            NavApp.NAVER -> originalScheme == "nmap"
            NavApp.GOOGLE_MAPS -> originalScheme in setOf("google.navigation", "googlemaps")
            NavApp.PICK_EACH_TIME -> false
        }

        if (originalMatches && capture.rawUri.isNotBlank()) {
            val originalUri = Uri.parse(capture.rawUri)
            if (app != NavApp.KAKAO_NAVI || isCompleteKakaoNaviUri(originalUri)) {
                result += originalUri
            }
        }

        val lat = capture.latitude
        val lng = capture.longitude
        if (lat == null || lng == null) return result.distinctBy { it.toString() }

        val name = capture.destinationName.ifBlank { "배달 목적지" }
        when (app) {
            NavApp.KAKAO_NAVI -> Unit // 공식 Kakao SDK 정보가 담긴 원본 URI만 재사용합니다.
            NavApp.KAKAO_MAP -> {
                result += Uri.parse("kakaomap://route?ep=${format(lat)},${format(lng)}&by=car")
                result += buildGeoUri(name, lat, lng)
            }
            NavApp.TMAP -> {
                val encodedName = Uri.encode(name)
                result += Uri.parse(
                    "tmap://route?rGoName=$encodedName&rGoX=${format(lng)}&rGoY=${format(lat)}"
                )
                result += Uri.parse(
                    "tmap://?rGoName=$encodedName&rGoX=${format(lng)}&rGoY=${format(lat)}"
                )
            }
            NavApp.NAVER -> {
                result += Uri.parse(
                    "nmap://navigation?dlat=${format(lat)}&dlng=${format(lng)}" +
                        "&dname=${Uri.encode(name)}&appname=${context.packageName}"
                )
                result += Uri.parse(
                    "nmap://route/car?dlat=${format(lat)}&dlng=${format(lng)}" +
                        "&dname=${Uri.encode(name)}&appname=${context.packageName}"
                )
            }
            NavApp.GOOGLE_MAPS -> {
                result += Uri.parse("google.navigation:q=${format(lat)},${format(lng)}&mode=d")
                result += buildGeoUri(name, lat, lng)
            }
            NavApp.PICK_EACH_TIME -> Unit
        }

        return result.distinctBy { it.toString() }
    }

    private fun isCompleteKakaoNaviUri(uri: Uri): Boolean {
        val hasApiVersion = !uri.getQueryParameter("apiver").isNullOrBlank() ||
            !uri.getQueryParameter("api_version").isNullOrBlank()
        return hasApiVersion &&
            !uri.getQueryParameter("appkey").isNullOrBlank() &&
            !uri.getQueryParameter("param").isNullOrBlank()
    }

    private fun buildGeoUri(name: String, lat: Double, lng: Double): Uri = Uri.parse(
        "geo:${format(lat)},${format(lng)}?q=" +
            Uri.encode("${format(lat)},${format(lng)}($name)")
    )

    private fun format(value: Double): String =
        String.format(java.util.Locale.US, "%.7f", value)
}
