package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.winzfs.navcapture.diagnostics.IncomingIntentLogStore
import com.winzfs.navcapture.parser.NavigationIntentParser

/**
 * Receives navigation requests from delivery apps, records the raw request for diagnostics,
 * and relays the parsed capture to MainActivity without rebuilding it as a different URI.
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
        setIntent(intent)
        relayToMain(intent)
        finish()
    }

    private fun relayToMain(sourceIntent: Intent) {
        val result = runCatching { parser.parse(sourceIntent) }
        IncomingIntentLogStore(this).record(
            sourceIntent = sourceIntent,
            parsedCapture = result.getOrNull(),
            parseError = result.exceptionOrNull(),
        )

        result.onSuccess { capture ->
            startActivity(MainActivity.relayIntent(this, capture))
        }.onFailure {
            startActivity(
                Intent(this, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                },
            )
        }
    }
}
