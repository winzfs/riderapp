package com.winzfs.navcapture.parser

import android.content.Intent
import com.winzfs.navcapture.model.CapturedDestination

class NavigationIntentParser(
    private val rawParser: RawNavigationUriParser = RawNavigationUriParser(),
) {
    fun parse(intent: Intent): CapturedDestination {
        val rawUri = intent.data?.toString().orEmpty()
        val parsed = rawParser.parse(rawUri)

        return CapturedDestination(
            capturedAt = System.currentTimeMillis(),
            action = intent.action.orEmpty(),
            rawUri = rawUri,
            scheme = parsed.scheme,
            host = parsed.host,
            path = parsed.path,
            latitude = parsed.latitude,
            longitude = parsed.longitude,
            destinationName = parsed.destinationName,
            format = parsed.format,
            extrasText = readExtras(intent),
            flags = intent.flags,
            categories = intent.categories?.sorted()?.joinToString().orEmpty(),
        )
    }

    private fun readExtras(intent: Intent): String {
        val extras = runCatching { intent.extras }.getOrNull() ?: return "없음"
        val keys = runCatching { extras.keySet().sorted() }.getOrDefault(emptyList())
        if (keys.isEmpty()) return "없음"
        return keys.joinToString(separator = "\n") { key ->
            val value = runCatching { extras.get(key) }
                .fold(
                    onSuccess = { it?.toString() ?: "null" },
                    onFailure = { "<읽기 실패: ${it.javaClass.simpleName}>" },
                )
            "$key = $value"
        }
    }
}
