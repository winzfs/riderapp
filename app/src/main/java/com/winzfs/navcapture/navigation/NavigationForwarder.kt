package com.winzfs.navcapture.navigation

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.winzfs.navcapture.model.CapturedDestination

class NavigationForwarder(private val context: Context) {

    fun forward(capture: CapturedDestination, requestedApp: NavApp): Result<NavApp> = runCatching {
        val targetApp = resolveTargetApp(capture, requestedApp)
        val targetUri = buildTargetUri(capture, targetApp)
            ?: throw IllegalArgumentException("목적지 좌표 또는 전달 가능한 URI가 없습니다.")

        val intent = Intent(Intent.ACTION_VIEW, targetUri).apply {
            targetApp.packageName?.let { setPackage(it) }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
        } catch (error: ActivityNotFoundException) {
            throw IllegalStateException("${targetApp.label} 앱을 열 수 없습니다.", error)
        }
        targetApp
    }

    private fun resolveTargetApp(capture: CapturedDestination, requestedApp: NavApp): NavApp {
        if (requestedApp != NavApp.AUTO) return requestedApp
        return when (capture.scheme.lowercase()) {
            "kakaomap" -> NavApp.KAKAO
            "nmap" -> NavApp.NAVER
            "tmap" -> NavApp.TMAP
            else -> NavApp.KAKAO
        }
    }

    private fun buildTargetUri(capture: CapturedDestination, app: NavApp): Uri? {
        val matchingOriginal = when (app) {
            NavApp.KAKAO -> capture.scheme == "kakaomap"
            NavApp.TMAP -> capture.scheme == "tmap"
            NavApp.NAVER -> capture.scheme == "nmap"
            NavApp.AUTO -> false
        }
        if (matchingOriginal && capture.rawUri.isNotBlank()) {
            return Uri.parse(capture.rawUri)
        }

        val lat = capture.latitude ?: return rawUriFallback(capture, app)
        val lng = capture.longitude ?: return rawUriFallback(capture, app)
        val name = capture.destinationName.ifBlank { "배달 목적지" }

        return when (app) {
            NavApp.KAKAO -> Uri.parse(
                "kakaomap://route?ep=${format(lat)},${format(lng)}&by=car"
            )
            NavApp.TMAP -> Uri.parse(
                "tmap://route?rGoName=${Uri.encode(name)}&rGoX=${format(lng)}&rGoY=${format(lat)}"
            )
            NavApp.NAVER -> Uri.parse(
                "nmap://navigation?dlat=${format(lat)}&dlng=${format(lng)}" +
                    "&dname=${Uri.encode(name)}&appname=${context.packageName}"
            )
            NavApp.AUTO -> null
        }
    }

    private fun rawUriFallback(capture: CapturedDestination, app: NavApp): Uri? {
        if (capture.rawUri.isBlank()) return null
        val raw = Uri.parse(capture.rawUri)
        val canReuse = when (app) {
            NavApp.KAKAO -> raw.scheme in setOf("kakaomap", "geo", "http", "https")
            NavApp.TMAP -> raw.scheme in setOf("tmap", "geo")
            NavApp.NAVER -> raw.scheme in setOf("nmap", "geo")
            NavApp.AUTO -> false
        }
        return raw.takeIf { canReuse }
    }

    private fun format(value: Double): String = String.format(java.util.Locale.US, "%.7f", value)
}
