package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.winzfs.navcapture.parser.NavigationIntentParser
import java.util.Locale

/**
 * Receives navigation requests from delivery apps, including explicit Intents
 * whose destination exists only in extras, and forwards a normalized request
 * to MainActivity.
 */
class NavigationReceiverActivity : Activity() {
    private val parser = NavigationIntentParser()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        forwardToMain(intent)
        finish()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        forwardToMain(intent)
        finish()
    }

    private fun forwardToMain(sourceIntent: Intent) {
        val capture = parser.parse(sourceIntent)
        val target = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        val preservedUri = capture.rawUri.takeIf(::isUsableNavigationUri)
        when {
            preservedUri != null -> {
                target.action = Intent.ACTION_VIEW
                target.data = Uri.parse(preservedUri)
            }
            capture.hasCoordinates -> {
                target.action = Intent.ACTION_VIEW
                target.data = buildGeoUri(
                    name = capture.destinationName.ifBlank { "배달 목적지" },
                    latitude = requireNotNull(capture.latitude),
                    longitude = requireNotNull(capture.longitude),
                )
            }
            capture.destinationName.isNotBlank() -> {
                target.action = Intent.ACTION_VIEW
                target.data = Uri.parse(
                    "geo:0,0?q=${Uri.encode(capture.destinationName)}",
                )
            }
            else -> target.action = Intent.ACTION_MAIN
        }

        startActivity(target)
    }

    private fun isUsableNavigationUri(value: String): Boolean {
        val scheme = value.substringBefore(':', "").lowercase(Locale.ROOT)
        return scheme in SUPPORTED_SCHEMES
    }

    private fun buildGeoUri(name: String, latitude: Double, longitude: Double): Uri {
        val lat = String.format(Locale.US, "%.7f", latitude)
        val lng = String.format(Locale.US, "%.7f", longitude)
        return Uri.parse("geo:$lat,$lng?q=${Uri.encode("$lat,$lng($name)")}")
    }

    companion object {
        private val SUPPORTED_SCHEMES = setOf(
            "geo", "kakaomap", "kakaonavi-sdk", "nmap", "tmap", "http", "https",
        )
    }
}
