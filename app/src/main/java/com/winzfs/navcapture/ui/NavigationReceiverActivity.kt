package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.winzfs.navcapture.parser.NavigationIntentParser

/**
 * Receives navigation requests from delivery apps and relays the parsed capture
 * to MainActivity without rebuilding it as a different URI.
 *
 * The original URI, destination text, coordinates, extras and ClipData snapshot
 * remain inside CapturedDestination and are not replaced by geocoding results.
 */
class NavigationReceiverActivity : Activity() {
    private val parser = NavigationIntentParser()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        relayToMain(intent)
        finish()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        relayToMain(intent)
        finish()
    }

    private fun relayToMain(sourceIntent: Intent) {
        val capture = parser.parse(sourceIntent)
        startActivity(MainActivity.relayIntent(this, capture))
    }
}
