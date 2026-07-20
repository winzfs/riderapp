package com.winzfs.navcapture.diagnostics

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.os.Build
import android.os.Bundle
import com.winzfs.navcapture.model.CapturedDestination
import org.json.JSONObject
import java.io.File
import java.lang.reflect.Array as ReflectArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Stores bounded, local-only snapshots of navigation Intents for parser development.
 * Address and memo text are intentionally retained, while likely credentials are masked.
 */
class IncomingIntentLogStore(private val activity: Activity) {
    private val logFile = File(activity.filesDir, FILE_NAME)

    data class Entry(
        val id: String,
        val capturedAt: Long,
        val summary: String,
        val content: String,
    )

    fun record(
        sourceIntent: Intent,
        parsedCapture: CapturedDestination?,
        parseError: Throwable? = null,
    ): Entry = synchronized(FILE_LOCK) {
        val now = System.currentTimeMillis()
        val source = sourceLabel(activity)
        val destination = parsedCapture?.destinationName.orEmpty().ifBlank {
            sourceIntent.data?.toString().orEmpty().take(80)
        }.ifBlank { "목적지명 없음" }
        val resultLabel = when {
            parseError != null -> "파싱 오류"
            parsedCapture == null -> "파싱 결과 없음"
            parsedCapture.hasCoordinates && parsedCapture.destinationName.isNotBlank() -> "이름+좌표"
            parsedCapture.hasCoordinates -> "좌표만"
            parsedCapture.destinationName.isNotBlank() -> "이름만"
            parsedCapture.rawUri.isNotBlank() -> "URI만"
            else -> "유효 목적지 없음"
        }
        val entry = Entry(
            id = UUID.randomUUID().toString(),
            capturedAt = now,
            summary = "$resultLabel · $destination · $source",
            content = buildContent(
                now = now,
                sourceIntent = sourceIntent,
                parsedCapture = parsedCapture,
                parseError = parseError,
                source = source,
            ),
        )

        val updated = buildList {
            add(entry)
            addAll(readInternal().filterNot { it.id == entry.id })
        }.take(MAX_ENTRIES)
        writeInternal(updated)
        entry
    }

    fun load(): List<Entry> = synchronized(FILE_LOCK) { readInternal() }

    fun clear() = synchronized(FILE_LOCK) {
        if (logFile.exists()) logFile.delete()
    }

    fun exportText(): String = load().joinToString("\n\n") { it.content }

    private fun buildContent(
        now: Long,
        sourceIntent: Intent,
        parsedCapture: CapturedDestination?,
        parseError: Throwable?,
        source: String,
    ): String = buildString {
        appendLine("════════════════════════════════")
        appendLine("수신 시각: ${formatTime(now)}")
        appendLine("앱 버전: ${appVersionLabel()}")
        appendLine("Android: ${Build.VERSION.RELEASE} / API ${Build.VERSION.SDK_INT}")
        appendLine("추정 호출 출처: $source")
        appendLine("callingPackage: ${activity.callingPackage.orEmpty().ifBlank { "없음" }}")
        appendLine("callingActivity: ${activity.callingActivity?.flattenToShortString().orEmpty().ifBlank { "없음" }}")
        appendLine("referrer: ${activity.referrer?.toString().orEmpty().ifBlank { "없음" }}")
        appendLine()
        appendLine("[Intent]")
        appendLine("action=${sourceIntent.action.orEmpty().ifBlank { "없음" }}")
        appendLine("data=${sanitizeText(sourceIntent.data?.toString().orEmpty()).ifBlank { "없음" }}")
        appendLine("type=${sourceIntent.type.orEmpty().ifBlank { "없음" }}")
        appendLine("package=${sourceIntent.`package`.orEmpty().ifBlank { "없음" }}")
        appendLine("component=${sourceIntent.component?.flattenToShortString().orEmpty().ifBlank { "없음" }}")
        appendLine("flags=0x${sourceIntent.flags.toUInt().toString(16)}")
        appendLine("categories=${sourceIntent.categories?.sorted()?.joinToString().orEmpty().ifBlank { "없음" }}")
        appendLine("selector=${renderIntentBrief(sourceIntent.selector)}")
        appendLine()
        append(renderExtras(sourceIntent))
        appendLine()
        append(renderClipData(sourceIntent.clipData))
        appendLine()
        appendLine("[Parser 결과]")
        if (parsedCapture == null) {
            appendLine("결과 없음")
        } else {
            appendLine("format=${parsedCapture.format.ifBlank { "없음" }}")
            appendLine("action=${parsedCapture.action.ifBlank { "없음" }}")
            appendLine("rawUri=${sanitizeText(parsedCapture.rawUri).ifBlank { "없음" }}")
            appendLine("scheme=${parsedCapture.scheme.ifBlank { "없음" }}")
            appendLine("host=${parsedCapture.host.ifBlank { "없음" }}")
            appendLine("path=${sanitizeText(parsedCapture.path).ifBlank { "없음" }}")
            appendLine("destinationName=${sanitizeText(parsedCapture.destinationName).ifBlank { "없음" }}")
            appendLine("latitude=${parsedCapture.latitude?.toString() ?: "없음"}")
            appendLine("longitude=${parsedCapture.longitude?.toString() ?: "없음"}")
            appendLine("hasCoordinates=${parsedCapture.hasCoordinates}")
            appendLine("meaningful=${parsedCapture.hasCoordinates || parsedCapture.destinationName.isNotBlank() || parsedCapture.rawUri.isNotBlank()}")
            appendLine("extrasSnapshot=")
            appendLine(indent(sanitizeText(parsedCapture.extrasText).ifBlank { "없음" }))
        }
        parseError?.let {
            appendLine()
            appendLine("[파싱 오류]")
            appendLine("${it.javaClass.name}: ${sanitizeText(it.message.orEmpty())}")
        }
    }.take(MAX_ENTRY_CHARS)

    private fun renderExtras(intent: Intent): String = buildString {
        appendLine("[Extras]")
        val extras = runCatching { intent.extras }.getOrNull()
        if (extras == null || extras.isEmpty) {
            appendLine("없음")
            return@buildString
        }
        val keys = runCatching { extras.keySet().sorted() }.getOrDefault(emptyList())
        keys.forEach { key ->
            val value = runCatching { extras.get(key) }
                .getOrElse { "<읽기 실패: ${it.javaClass.simpleName}>" }
            appendLine("$key=${renderValue(key, value, 0)}")
        }
    }

    private fun renderClipData(clipData: ClipData?): String = buildString {
        appendLine("[ClipData]")
        if (clipData == null || clipData.itemCount == 0) {
            appendLine("없음")
            return@buildString
        }
        appendLine("description=${sanitizeText(clipData.description?.toString().orEmpty())}")
        for (index in 0 until clipData.itemCount.coerceAtMost(MAX_CLIP_ITEMS)) {
            val item = clipData.getItemAt(index)
            appendLine("item[$index].text=${sanitizeText(item.text?.toString().orEmpty()).ifBlank { "없음" }}")
            appendLine("item[$index].uri=${sanitizeText(item.uri?.toString().orEmpty()).ifBlank { "없음" }}")
            appendLine("item[$index].intent=${renderIntentBrief(item.intent)}")
        }
        if (clipData.itemCount > MAX_CLIP_ITEMS) {
            appendLine("… ${clipData.itemCount - MAX_CLIP_ITEMS}개 항목 생략")
        }
    }

    private fun renderValue(keyPath: String, value: Any?, depth: Int): String {
        if (isSensitiveKey(keyPath)) return "<마스킹>"
        if (value == null) return "null"
        if (depth >= MAX_NESTING_DEPTH) return sanitizeText(value.toString())

        return when (value) {
            is Bundle -> value.keySet().sorted().joinToString(
                prefix = "Bundle{",
                postfix = "}",
                separator = ", ",
            ) { key ->
                val nested = runCatching { value.get(key) }
                    .getOrElse { "<읽기 실패: ${it.javaClass.simpleName}>" }
                "$key=${renderValue("$keyPath.$key", nested, depth + 1)}"
            }
            is Intent -> renderIntentBrief(value)
            is Iterable<*> -> value.take(MAX_COLLECTION_ITEMS)
                .mapIndexed { index, item -> renderValue("$keyPath[$index]", item, depth + 1) }
                .joinToString(prefix = "[", postfix = "]")
            is Map<*, *> -> value.entries.take(MAX_COLLECTION_ITEMS).joinToString(
                prefix = "{",
                postfix = "}",
            ) { (mapKey, mapValue) ->
                val childKey = mapKey?.toString().orEmpty()
                "$childKey=${renderValue("$keyPath.$childKey", mapValue, depth + 1)}"
            }
            else -> {
                if (value.javaClass.isArray) {
                    val length = ReflectArray.getLength(value)
                    (0 until minOf(length, MAX_COLLECTION_ITEMS)).joinToString(
                        prefix = "[",
                        postfix = if (length > MAX_COLLECTION_ITEMS) ", …]" else "]",
                    ) { index ->
                        renderValue("$keyPath[$index]", ReflectArray.get(value, index), depth + 1)
                    }
                } else {
                    sanitizeText(value.toString())
                }
            }
        }
    }

    private fun renderIntentBrief(intent: Intent?): String {
        if (intent == null) return "없음"
        return buildString {
            append("Intent{")
            append("action=${intent.action.orEmpty()}, ")
            append("data=${sanitizeText(intent.data?.toString().orEmpty())}, ")
            append("package=${intent.`package`.orEmpty()}, ")
            append("component=${intent.component?.flattenToShortString().orEmpty()}")
            append('}')
        }
    }

    private fun appVersionLabel(): String = runCatching {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
        "${info.versionName.orEmpty().ifBlank { "알 수 없음" }} ($versionCode)"
    }.getOrDefault("확인 불가")

    private fun sanitizeText(value: String): String {
        if (value.isBlank()) return ""
        val masked = SECRET_ASSIGNMENT.replace(value) { match ->
            "${match.groupValues[1]}=<마스킹>"
        }
        return masked.replace(Regex("\\s+"), " ").trim().take(MAX_VALUE_CHARS)
    }

    private fun isSensitiveKey(value: String): Boolean = SENSITIVE_KEY.containsMatchIn(value)

    private fun sourceLabel(activity: Activity): String {
        val referrer = activity.referrer?.toString().orEmpty()
        return activity.callingPackage
            ?: activity.callingActivity?.packageName
            ?: referrer.removePrefix("android-app://").substringBefore('/').takeIf(String::isNotBlank)
            ?: "확인 불가"
    }

    private fun indent(value: String): String = value.lineSequence().joinToString("\n") { "  $it" }

    private fun formatTime(timestamp: Long): String =
        SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.KOREA).format(Date(timestamp))

    private fun readInternal(): List<Entry> {
        if (!logFile.exists()) return emptyList()
        return runCatching {
            logFile.useLines { lines ->
                lines.mapNotNull { line ->
                    runCatching {
                        val json = JSONObject(line)
                        Entry(
                            id = json.optString("id"),
                            capturedAt = json.optLong("capturedAt"),
                            summary = json.optString("summary"),
                            content = json.optString("content"),
                        )
                    }.getOrNull()
                }.toList()
            }
        }.getOrDefault(emptyList())
    }

    private fun writeInternal(entries: List<Entry>) {
        logFile.parentFile?.mkdirs()
        logFile.bufferedWriter().use { writer ->
            entries.forEach { entry ->
                writer.appendLine(
                    JSONObject()
                        .put("id", entry.id)
                        .put("capturedAt", entry.capturedAt)
                        .put("summary", entry.summary)
                        .put("content", entry.content)
                        .toString(),
                )
            }
        }
    }

    companion object {
        private val FILE_LOCK = Any()
        private const val FILE_NAME = "incoming-navigation-intents.jsonl"
        private const val MAX_ENTRIES = 100
        private const val MAX_ENTRY_CHARS = 40_000
        private const val MAX_VALUE_CHARS = 8_000
        private const val MAX_COLLECTION_ITEMS = 30
        private const val MAX_CLIP_ITEMS = 10
        private const val MAX_NESTING_DEPTH = 4
        private val SENSITIVE_KEY = Regex(
            "(?i)(?:token|auth|password|passwd|secret|api.?key|app.?key|session|cookie|bearer|client.?secret|access.?key)",
        )
        private val SECRET_ASSIGNMENT = Regex(
            "(?i)(token|auth|password|passwd|secret|api.?key|app.?key|session|cookie|bearer|client.?secret|access.?key)\\s*[:=]\\s*[^&,;\\s}\"]+",
        )
    }
}
