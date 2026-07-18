package com.winzfs.navcapture.parser

import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Locale

/**
 * Extracts a destination from an Intent's data URI, extras and ClipData text.
 * Some delivery apps use an explicit Intent and place the destination only in extras.
 */
class RawNavigationPayloadParser(
    private val uriParser: RawNavigationUriParser = RawNavigationUriParser(),
) {
    data class Result(
        val parsed: ParsedNavigationUri,
        val sourceUri: String = "",
        val source: String = "unknown",
    )

    fun parse(
        rawUri: String,
        extras: Map<String, String>,
        clipTexts: List<String>,
    ): Result {
        val uriCandidates = buildList {
            if (rawUri.isNotBlank()) add(UriCandidate(rawUri, "data URI", 30))
            extras.forEach { (key, value) ->
                extractUris(value).forEach { add(UriCandidate(it, "extra:$key", 15)) }
            }
            clipTexts.forEach { value ->
                extractUris(value).forEach { add(UriCandidate(it, "ClipData", 20)) }
            }
        }

        val bestUri = uriCandidates
            .map { candidate -> candidate to uriParser.parse(candidate.uri) }
            .maxByOrNull { (candidate, parsed) -> score(parsed) + candidate.bonus }
            ?.takeIf { (_, parsed) -> parsed.hasUsefulDestination }

        val flat = parseFlatPayload(extras, clipTexts)
        if (flat != null) {
            val flatScore = score(flat)
            val uriScore = bestUri?.let { (candidate, parsed) -> score(parsed) + candidate.bonus }
                ?: Int.MIN_VALUE
            if (flatScore >= uriScore) {
                return Result(parsed = flat, source = "Intent extras")
            }
        }

        if (bestUri != null) {
            return Result(
                parsed = bestUri.second,
                sourceUri = bestUri.first.uri,
                source = bestUri.first.source,
            )
        }

        return Result(
            parsed = uriParser.parse(rawUri),
            sourceUri = rawUri,
            source = if (rawUri.isBlank()) "unknown" else "data URI",
        )
    }

    private fun parseFlatPayload(
        extras: Map<String, String>,
        clipTexts: List<String>,
    ): ParsedNavigationUri? {
        val values = extras.entries.map { normalizeKey(it.key) to it.value }
        val latitude = findNumber(values, LATITUDE_KEYS)
        val longitude = findNumber(values, LONGITUDE_KEYS)
        val x = findNumber(values, X_KEYS)
        val y = findNumber(values, Y_KEYS)

        val combinedText = buildString {
            extras.forEach { (key, value) -> appendLine("$key=$value") }
            clipTexts.forEach(::appendLine)
        }

        val textLat = findLabeledNumber(combinedText, LATITUDE_LABELS)
        val textLng = findLabeledNumber(combinedText, LONGITUDE_LABELS)
        val textX = findLabeledNumber(combinedText, X_LABELS)
        val textY = findLabeledNumber(combinedText, Y_LABELS)

        val coordinatePair = chooseCoordinatePair(
            latitude = latitude ?: textLat,
            longitude = longitude ?: textLng,
            x = x ?: textX,
            y = y ?: textY,
            text = combinedText,
        )

        val name = findText(values, NAME_KEYS)
            .ifBlank { findLabeledText(combinedText, NAME_LABELS) }
            .ifBlank { findAddressLikeText(extras.values + clipTexts) }

        if (coordinatePair == null && name.isBlank()) return null

        return ParsedNavigationUri(
            scheme = "intent-extra",
            latitude = coordinatePair?.first,
            longitude = coordinatePair?.second,
            destinationName = name,
            format = "Android Intent extras",
        )
    }

    private fun chooseCoordinatePair(
        latitude: Double?,
        longitude: Double?,
        x: Double?,
        y: Double?,
        text: String,
    ): Pair<Double, Double>? {
        validPair(latitude, longitude)?.let { return it }
        validPair(y, x)?.let { return it }

        COORDINATE_PAIR.findAll(text).forEach { match ->
            val first = match.groupValues[1].toDoubleOrNull() ?: return@forEach
            val second = match.groupValues[2].toDoubleOrNull() ?: return@forEach
            validPair(first, second)?.let { return it }
            validPair(second, first)?.let { return it }
        }
        return null
    }

    private fun validPair(latitude: Double?, longitude: Double?): Pair<Double, Double>? {
        if (latitude == null || longitude == null) return null
        if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return null
        if (latitude == 0.0 && longitude == 0.0) return null
        return latitude to longitude
    }

    private fun findNumber(
        values: List<Pair<String, String>>,
        keys: Set<String>,
    ): Double? = values.firstNotNullOfOrNull { (key, value) ->
        if (key in keys) NUMBER.find(value)?.value?.toDoubleOrNull() else null
    }

    private fun findText(
        values: List<Pair<String, String>>,
        keys: Set<String>,
    ): String = values.firstNotNullOfOrNull { (key, value) ->
        value.trim().trim('"', '\'', ' ') .takeIf { key in keys && it.isNotBlank() && !NUMBER_ONLY.matches(it) }
    }.orEmpty()

    private fun findLabeledNumber(text: String, labels: List<String>): Double? {
        labels.forEach { label ->
            val regex = Regex(
                "(?i)(?:\\\"|^|[^a-z0-9])${Regex.escape(label)}(?:\\\"|\\s)*[:=]\\s*\\\"?(-?\\d+(?:\\.\\d+)?)",
            )
            regex.find(text)?.groupValues?.getOrNull(1)?.toDoubleOrNull()?.let { return it }
        }
        return null
    }

    private fun findLabeledText(text: String, labels: List<String>): String {
        labels.forEach { label ->
            val regex = Regex(
                "(?i)(?:\\\"|^|[^a-z0-9])${Regex.escape(label)}(?:\\\"|\\s)*[:=]\\s*\\\"?([^\\\"\\n,;}]+)",
            )
            regex.find(text)?.groupValues?.getOrNull(1)?.trim()?.takeIf(String::isNotBlank)?.let {
                return it
            }
        }
        return ""
    }

    private fun findAddressLikeText(values: Collection<String>): String = values
        .asSequence()
        .map(String::trim)
        .filter { it.length in 3..180 }
        .firstOrNull { value ->
            ROAD_ADDRESS.containsMatchIn(value) || LOT_ADDRESS.containsMatchIn(value)
        }
        .orEmpty()

    private fun extractUris(value: String): List<String> {
        val variants = linkedSetOf(value.trim())
        repeat(2) {
            variants.toList().forEach { variants += decode(it) }
        }
        return variants.flatMap { variant ->
            buildList {
                if (looksLikeUri(variant)) add(cleanUri(variant))
                URI_IN_TEXT.findAll(variant).forEach { add(cleanUri(it.value)) }
            }
        }.filter(String::isNotBlank).distinct()
    }

    private fun looksLikeUri(value: String): Boolean =
        SUPPORTED_SCHEMES.any { scheme -> value.startsWith("$scheme:", ignoreCase = true) }

    private fun cleanUri(value: String): String = value
        .trim()
        .trimEnd(')', ']', '}', ',', ';', '"', '\'')

    private fun decode(value: String): String = runCatching {
        URLDecoder.decode(value, StandardCharsets.UTF_8.name())
    }.getOrDefault(value)

    private fun score(parsed: ParsedNavigationUri): Int =
        (if (parsed.latitude != null && parsed.longitude != null) 100 else 0) +
            (if (parsed.destinationName.isNotBlank()) 25 else 0) +
            (if (parsed.scheme in SUPPORTED_SCHEMES) 10 else 0)

    private fun normalizeKey(value: String): String = value
        .lowercase(Locale.ROOT)
        .replace(NON_ALPHANUMERIC, "")

    private data class UriCandidate(
        val uri: String,
        val source: String,
        val bonus: Int,
    )

    companion object {
        private val SUPPORTED_SCHEMES = setOf(
            "geo", "kakaomap", "kakaonavi-sdk", "nmap", "tmap", "http", "https",
        )
        private val LATITUDE_KEYS = setOf(
            "lat", "latitude", "destlat", "destinationlat", "dlat", "goallat", "targetlat", "endlat",
        )
        private val LONGITUDE_KEYS = setOf(
            "lng", "lon", "longitude", "destlng", "destinationlng", "dlng", "goallng", "targetlng", "endlng",
        )
        private val X_KEYS = setOf("x", "destx", "destinationx", "goalx", "targetx", "endx", "rgox")
        private val Y_KEYS = setOf("y", "desty", "destinationy", "goaly", "targety", "endy", "rgoy")
        private val NAME_KEYS = setOf(
            "name", "title", "placename", "destinationname", "destname", "goalname", "targetname",
            "endname", "rgoname", "dname", "address", "destinationaddress",
        )
        private val LATITUDE_LABELS = listOf("latitude", "lat", "dlat", "goalLat", "destLat", "targetLat")
        private val LONGITUDE_LABELS = listOf("longitude", "lng", "lon", "dlng", "goalLng", "destLng", "targetLng")
        private val X_LABELS = listOf("destinationX", "destX", "goalX", "rGoX", "targetX", "endX", "x")
        private val Y_LABELS = listOf("destinationY", "destY", "goalY", "rGoY", "targetY", "endY", "y")
        private val NAME_LABELS = listOf(
            "destinationName", "destName", "goalName", "rGoName", "targetName", "placeName", "dname", "name", "address",
        )
        private val NON_ALPHANUMERIC = Regex("[^a-z0-9가-힣]")
        private val NUMBER = Regex("-?\\d+(?:\\.\\d+)?")
        private val NUMBER_ONLY = Regex("^-?\\d+(?:\\.\\d+)?$")
        private val COORDINATE_PAIR = Regex("(-?\\d{2,3}(?:\\.\\d+)?)\\s*[,/ ]\\s*(-?\\d{2,3}(?:\\.\\d+)?)")
        private val URI_IN_TEXT = Regex(
            "(?i)(?:geo|kakaomap|kakaonavi-sdk|nmap|tmap|https?)\\:[^\\s]+",
        )
        private val ROAD_ADDRESS = Regex("[가-힣0-9]+(?:로|길)\\s*\\d+")
        private val LOT_ADDRESS = Regex("[가-힣0-9]+(?:동|리|가)\\s*\\d+")
    }
}

private val ParsedNavigationUri.hasUsefulDestination: Boolean
    get() = (latitude != null && longitude != null) || destinationName.isNotBlank()
