package com.winzfs.navcapture.parser

import android.content.Intent
import com.winzfs.navcapture.model.CapturedDestination

class NavigationIntentParser(
    private val payloadParser: RawNavigationPayloadParser = RawNavigationPayloadParser(),
) {
    fun parse(intent: Intent): CapturedDestination {
        val dataUri = intent.data?.toString().orEmpty()
        val extras = readExtrasMap(intent)
        val clipTexts = readClipTexts(intent)
        val payload = payloadParser.parse(
            rawUri = dataUri,
            extras = extras,
            clipTexts = clipTexts,
        )
        val parsed = payload.parsed

        return CapturedDestination(
            capturedAt = System.currentTimeMillis(),
            action = intent.action.orEmpty(),
            rawUri = payload.sourceUri.ifBlank { dataUri },
            scheme = parsed.scheme,
            host = parsed.host,
            path = parsed.path,
            latitude = parsed.latitude,
            longitude = parsed.longitude,
            destinationName = parsed.destinationName,
            format = if (payload.source == "data URI") parsed.format else "${parsed.format} · ${payload.source}",
            extrasText = renderPayloadText(extras, clipTexts),
            flags = intent.flags,
            categories = intent.categories?.sorted()?.joinToString().orEmpty(),
        )
    }

    private fun readExtrasMap(intent: Intent): Map<String, String> {
        val extras = runCatching { intent.extras }.getOrNull() ?: return emptyMap()
        val keys = runCatching { extras.keySet().sorted() }.getOrDefault(emptyList())
        return buildMap {
            keys.forEach { key ->
                val value = runCatching { extras.get(key) }
                    .fold(
                        onSuccess = { it?.toString() ?: "null" },
                        onFailure = { "<읽기 실패: ${it.javaClass.simpleName}>" },
                    )
                put(key, value)
            }
        }
    }

    private fun readClipTexts(intent: Intent): List<String> {
        val clipData = intent.clipData ?: return emptyList()
        return buildList {
            for (index in 0 until clipData.itemCount) {
                val item = clipData.getItemAt(index)
                item.text?.toString()?.takeIf(String::isNotBlank)?.let(::add)
                item.uri?.toString()?.takeIf(String::isNotBlank)?.let(::add)
                item.intent?.data?.toString()?.takeIf(String::isNotBlank)?.let(::add)
            }
        }
    }

    private fun renderPayloadText(
        extras: Map<String, String>,
        clipTexts: List<String>,
    ): String = buildString {
        if (extras.isEmpty()) {
            appendLine("[Extras] 없음")
        } else {
            appendLine("[Extras]")
            extras.forEach { (key, value) -> appendLine("$key = $value") }
        }
        if (clipTexts.isNotEmpty()) {
            appendLine("[ClipData]")
            clipTexts.forEach(::appendLine)
        }
    }.trim()
}
