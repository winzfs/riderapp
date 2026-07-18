package com.winzfs.navcapture.address

/**
 * Extracts Korean road/lot addresses and apartment unit details from delivery-app text.
 * The delivery app's original text is treated as more authoritative than reverse geocoding.
 */
object KoreanAddressTextParser {
    data class ParsedAddress(
        val roadAddress: String = "",
        val lotAddress: String = "",
        val unitDetail: String = "",
    )

    fun parse(destinationName: String, payloadText: String): ParsedAddress {
        val candidates = buildList {
            destinationName.trim().takeIf(String::isNotBlank)?.let {
                add(TextCandidate(it, 90))
            }
            payloadText.lineSequence().forEach { rawLine ->
                val line = rawLine.trim()
                if (line.isBlank()) return@forEach
                val key = line.substringBefore('=', "").trim().lowercase()
                val value = line.substringAfter('=', line).trim()
                val bonus = when {
                    key.contains("road") || key.contains("도로명") -> 160
                    key.contains("address") || key.contains("주소") || key.contains("addr") -> 130
                    key.contains("destination") || key.contains("goal") || key.contains("target") -> 105
                    key.contains("name") || key.contains("title") -> 80
                    else -> 30
                }
                add(TextCandidate(value, bonus))
            }
        }

        val road = candidates.mapNotNull { candidate ->
            extractRoadAddress(candidate.text).takeIf(String::isNotBlank)?.let { value ->
                ScoredText(value, candidate.score + value.length.coerceAtMost(50))
            }
        }.maxByOrNull(ScoredText::score)?.value.orEmpty()

        val lot = candidates.mapNotNull { candidate ->
            extractLotAddress(candidate.text).takeIf(String::isNotBlank)?.let { value ->
                ScoredText(value, candidate.score + value.length.coerceAtMost(50))
            }
        }.maxByOrNull(ScoredText::score)?.value.orEmpty()

        val unit = candidates.mapNotNull { candidate ->
            extractUnitDetail(candidate.text).takeIf(String::isNotBlank)?.let { value ->
                ScoredText(value, candidate.score + value.length.coerceAtMost(30))
            }
        }.maxByOrNull(ScoredText::score)?.value.orEmpty()

        return ParsedAddress(
            roadAddress = road,
            lotAddress = lot,
            unitDetail = unit,
        )
    }

    fun extractRoadAddress(value: String): String = ROAD_ADDRESS.find(clean(value))
        ?.value
        ?.let(::normalizeAddress)
        .orEmpty()

    fun extractLotAddress(value: String): String = LOT_ADDRESS.find(clean(value))
        ?.value
        ?.let(::normalizeAddress)
        .orEmpty()

    fun extractUnitDetail(value: String): String {
        val cleaned = clean(value)
        val matches = buildList {
            DONG_DETAIL.findAll(cleaned).forEach { add(it.range.first to normalizeUnit(it.value)) }
            LETTER_DONG_DETAIL.findAll(cleaned).forEach { add(it.range.first to normalizeUnit(it.value)) }
            FLOOR_DETAIL.findAll(cleaned).forEach { add(it.range.first to normalizeUnit(it.value)) }
            HO_DETAIL.findAll(cleaned).forEach { add(it.range.first to normalizeUnit(it.value)) }
        }
        return matches
            .sortedBy { it.first }
            .map { it.second }
            .distinct()
            .joinToString(" ")
    }

    fun isAddressLike(value: String): Boolean =
        extractRoadAddress(value).isNotBlank() || extractLotAddress(value).isNotBlank()

    fun isUnitOnlyFeature(value: String): Boolean {
        val normalized = value.trim().replace(WHITESPACE, " ")
        if (normalized.isBlank()) return false
        return UNIT_ONLY.matches(normalized)
    }

    fun searchQuery(value: String): String {
        val cleaned = clean(value)
        val road = extractRoadAddress(cleaned)
        if (road.isNotBlank()) return road
        val lot = extractLotAddress(cleaned)
        if (lot.isNotBlank()) return lot
        return cleaned
            .replace(DONG_DETAIL, " ")
            .replace(LETTER_DONG_DETAIL, " ")
            .replace(FLOOR_DETAIL, " ")
            .replace(HO_DETAIL, " ")
            .replace(WHITESPACE, " ")
            .trim()
            .take(160)
    }

    private fun clean(value: String): String = value
        .replace(ESCAPED_NEWLINE, " ")
        .replace(JSON_NOISE, " ")
        .replace(WHITESPACE, " ")
        .trim()

    private fun normalizeAddress(value: String): String = value
        .replace(LEADING_NOISE, "")
        .replace(WHITESPACE, " ")
        .trim(' ', ',', ';', ']', '}', '"', '\'')

    private fun normalizeUnit(value: String): String = value
        .replace(WHITESPACE, "")
        .replace("제", "")
        .trim()

    private data class TextCandidate(val text: String, val score: Int)
    private data class ScoredText(val value: String, val score: Int)

    private val WHITESPACE = Regex("\\s+")
    private val ESCAPED_NEWLINE = Regex("\\\\[nrt]")
    private val JSON_NOISE = Regex("[\\[\\]{}\"']")
    private val LEADING_NOISE = Regex(
        "^(?:(?:roadaddress|destinationaddress|address|addr|도로명주소|주소|bundle)\\s+)+",
        RegexOption.IGNORE_CASE,
    )

    private val ROAD_ADDRESS = Regex(
        "(?:[가-힣A-Za-z0-9·.\\-]+\\s+){0,5}[가-힣A-Za-z0-9·.\\-]+(?:대로|로|길)\\s*\\d+(?:-\\d+)?",
    )
    private val LOT_ADDRESS = Regex(
        "(?:[가-힣A-Za-z0-9·.\\-]+\\s+){1,5}[가-힣A-Za-z][가-힣A-Za-z0-9·.\\-]*(?:읍|면|동|리|가)\\s+\\d+(?:-\\d+)?",
    )
    private val DONG_DETAIL = Regex("(?<![가-힣A-Za-z0-9])(?:제\\s*)?\\d{1,4}\\s*동(?![가-힣])")
    private val LETTER_DONG_DETAIL = Regex("(?<![가-힣A-Za-z0-9])[A-Za-z]\\s*동(?![가-힣])")
    private val FLOOR_DETAIL = Regex("(?<![가-힣A-Za-z0-9])(?:지하\\s*)?\\d{1,3}\\s*층(?![가-힣])")
    private val HO_DETAIL = Regex("(?<![가-힣A-Za-z0-9])[A-Za-z]?\\d{1,5}\\s*호(?![가-힣])")
    private val UNIT_ONLY = Regex(
        "^(?:(?:제\\s*)?\\d{1,4}\\s*동|[A-Za-z]\\s*동|(?:지하\\s*)?\\d{1,3}\\s*층|[A-Za-z]?\\d{1,5}\\s*호)(?:\\s+(?:(?:제\\s*)?\\d{1,4}\\s*동|[A-Za-z]\\s*동|(?:지하\\s*)?\\d{1,3}\\s*층|[A-Za-z]?\\d{1,5}\\s*호))*$",
    )
}
