package com.winzfs.navcapture.overlay

import com.winzfs.navcapture.address.KoreanAddressTextParser
import java.util.Locale

/**
 * Builds compact overlay text without changing any delivery-app source value.
 * Every operation here is display-only.
 */
object DestinationOverlayFormatter {
    data class DisplayParts(
        val primaryAddress: String,
        val buildingName: String,
        val unitDetail: String,
    )

    fun format(
        sourceText: String,
        sourcePayloadText: String,
        referenceRoadAddress: String,
        userDisplayName: String = "",
    ): DisplayParts {
        val parsed = KoreanAddressTextParser.parse(
            destinationName = sourceText,
            payloadText = sourcePayloadText,
        )
        val sourceAddress = parsed.roadAddress.ifBlank { parsed.lotAddress }
        val primaryAddress = stripAdministrativePrefix(
            sourceAddress.ifBlank { referenceRoadAddress },
        )
        val unitDetail = mergeUnitDetails(
            parsed.unitDetail,
            extractStructuredUnit(sourcePayloadText),
        )
        val buildingName = extractBuildingName(
            sourceText = sourceText,
            sourcePayloadText = sourcePayloadText,
            sourceAddress = sourceAddress,
            unitDetail = unitDetail,
        ).ifBlank { userDisplayName.trim() }

        val sourceFallback = cleanText(sourceText)
            .let(::stripAdministrativePrefix)
            .removeExact(buildingName)
            .removeUnitDetails()
            .trimSeparators()

        return DisplayParts(
            primaryAddress = primaryAddress.ifBlank {
                sourceFallback.ifBlank { buildingName.ifBlank { "목적지 정보 없음" } }
            },
            buildingName = buildingName.takeUnless {
                it.equals(primaryAddress, ignoreCase = true)
            }.orEmpty(),
            unitDetail = unitDetail,
        )
    }

    fun stripAdministrativePrefix(value: String): String {
        val normalized = cleanText(value)
        if (normalized.isBlank()) return ""

        val tokens = normalized.split(' ').filter(String::isNotBlank)
        var cutIndex = -1
        val scanLimit = minOf(tokens.size, 6)
        for (index in 0 until scanLimit) {
            val token = tokens[index].trim(',', '(', ')', '[', ']', '{', '}')
            if (ADMINISTRATIVE_TOKEN.matches(token)) {
                cutIndex = index
                continue
            }
            if (cutIndex >= 0 && index > cutIndex + 1) break
        }

        return tokens
            .drop(cutIndex + 1)
            .joinToString(" ")
            .trimSeparators()
            .ifBlank { normalized }
    }

    private fun extractBuildingName(
        sourceText: String,
        sourcePayloadText: String,
        sourceAddress: String,
        unitDetail: String,
    ): String {
        val structured = payloadFields(sourcePayloadText)
            .asSequence()
            .filter { normalizeKey(it.first) in BUILDING_KEYS }
            .map { (_, value) -> sanitizeBuildingCandidate(value, sourceAddress, unitDetail) }
            .firstOrNull { it.isNotBlank() }
        if (!structured.isNullOrBlank()) return structured

        val candidates = buildList {
            add(sourceText)
            payloadFields(sourcePayloadText).forEach { (_, value) -> add(value) }
            sourcePayloadText.lineSequence()
                .map(String::trim)
                .filter { it.isNotBlank() && !it.startsWith('[') }
                .forEach(::add)
        }

        candidates.forEach { candidate ->
            val cleaned = sanitizeBuildingCandidate(candidate, sourceAddress, unitDetail)
            BUILDING_PHRASE.find(cleaned)?.value
                ?.trimSeparators()
                ?.takeIf(String::isNotBlank)
                ?.let { return it }
        }

        return sanitizeBuildingCandidate(sourceText, sourceAddress, unitDetail)
            .takeIf { candidate ->
                candidate.length in 2..80 &&
                    !KoreanAddressTextParser.isAddressLike(candidate) &&
                    !KoreanAddressTextParser.isUnitOnlyFeature(candidate) &&
                    !GENERIC_SOURCE_TEXT.matches(candidate)
            }
            .orEmpty()
    }

    private fun sanitizeBuildingCandidate(
        value: String,
        sourceAddress: String,
        unitDetail: String,
    ): String = cleanText(value)
        .substringAfter('=', cleanText(value))
        .removeExact(sourceAddress)
        .removeExact(unitDetail)
        .removeUnitDetails()
        .let(::stripAdministrativePrefix)
        .replace(KEY_VALUE_NOISE, " ")
        .replace(WHITESPACE, " ")
        .trimSeparators()
        .take(100)

    private fun extractStructuredUnit(payloadText: String): String {
        var dong = ""
        var ho = ""
        var floor = ""

        payloadFields(payloadText).forEach { (key, rawValue) ->
            val normalizedKey = normalizeKey(key)
            val value = cleanText(rawValue).trimSeparators()
            when {
                normalizedKey in DONG_KEYS -> normalizeNumberedDetail(value, "동")?.let { dong = it }
                normalizedKey in HO_KEYS -> normalizeNumberedDetail(value, "호")?.let { ho = it }
                normalizedKey in FLOOR_KEYS -> normalizeNumberedDetail(value, "층")?.let { floor = it }
            }
        }

        return listOf(dong, floor, ho).filter(String::isNotBlank).joinToString(" ")
    }

    private fun normalizeNumberedDetail(value: String, suffix: String): String? {
        val compact = value.replace(WHITESPACE, "").removePrefix("제")
        if (compact.isBlank()) return null
        if (compact.endsWith(suffix)) return compact.takeIf { DETAIL_VALUE.matches(it) }
        if (!PLAIN_UNIT_VALUE.matches(compact)) return null
        return "$compact$suffix"
    }

    private fun mergeUnitDetails(vararg values: String): String {
        val ordered = linkedSetOf<String>()
        values.forEach { value ->
            UNIT_TOKEN.findAll(value).forEach { match ->
                ordered += match.value.replace(WHITESPACE, "").removePrefix("제")
            }
        }
        return ordered.joinToString(" ")
    }

    private fun payloadFields(payloadText: String): List<Pair<String, String>> = payloadText
        .lineSequence()
        .map(String::trim)
        .filter { it.isNotBlank() && !it.startsWith('[') && it.contains('=') }
        .map { line -> line.substringBefore('=') to line.substringAfter('=') }
        .toList()

    private fun normalizeKey(value: String): String = value
        .lowercase(Locale.ROOT)
        .replace(NON_ALPHANUMERIC, "")

    private fun cleanText(value: String): String = value
        .replace(ESCAPED_NEWLINE, " ")
        .replace(JSON_WRAPPERS, " ")
        .replace(WHITESPACE, " ")
        .trim()

    private fun String.removeExact(value: String): String =
        if (value.isBlank()) this else replace(value, " ", ignoreCase = true)

    private fun String.removeUnitDetails(): String = replace(UNIT_TOKEN, " ")
        .replace(WHITESPACE, " ")

    private fun String.trimSeparators(): String = trim(
        ' ', ',', ';', ':', '|', '/', '-', '_', '(', ')', '[', ']', '{', '}', '"', '\'',
    )

    private val WHITESPACE = Regex("\\s+")
    private val ESCAPED_NEWLINE = Regex("\\\\[nrt]")
    private val JSON_WRAPPERS = Regex("[\\[\\]{}\\\"']")
    private val NON_ALPHANUMERIC = Regex("[^a-z0-9가-힣]")
    private val KEY_VALUE_NOISE = Regex(
        "(?i)\\b(?:address|destination|dest|goal|target|name|title|building|apartment|apt|place|bundle)\\b",
    )
    private val ADMINISTRATIVE_TOKEN = Regex(
        "^[가-힣·]+(?:특별자치도|특별자치시|특별시|광역시|도|시|군|구)$",
    )
    private val UNIT_TOKEN = Regex(
        "(?<![가-힣A-Za-z0-9])(?:제\\s*)?(?:[A-Za-z]|\\d{1,5})\\s*(?:동|호|층)(?![가-힣])",
    )
    private val PLAIN_UNIT_VALUE = Regex("^[A-Za-z]?\\d{1,5}$")
    private val DETAIL_VALUE = Regex("^(?:[A-Za-z]|\\d{1,5})(?:동|호|층)$")
    private val BUILDING_PHRASE = Regex(
        "(?:[가-힣A-Za-z0-9·()\\-]+\\s+){0,4}[가-힣A-Za-z0-9·()\\-]+" +
            "(?:아파트|오피스텔|빌라|빌딩|타워|센터|상가|프라자|플라자|병원|의원|학교|대학교|호텔|마트|몰|주택|맨션|캐슬|자이|푸르지오|힐스테이트|아이파크|더샵|래미안|하우스)",
    )
    private val GENERIC_SOURCE_TEXT = Regex(
        "(?i)^(?:배달\\s*목적지|목적지|destination|delivery destination|이름 없음)$",
    )

    private val BUILDING_KEYS = setOf(
        "building", "buildingname", "buildingtitle", "apt", "aptname", "apartment",
        "apartmentname", "complex", "complexname", "placename", "destinationbuilding",
        "destinationbuildingname", "destbuilding", "goalbuilding", "addressname",
    )
    private val DONG_KEYS = setOf(
        "dong", "buildingdong", "aptdong", "apartmentdong", "destinationdong", "destdong",
        "goaldong", "unitdong",
    )
    private val HO_KEYS = setOf(
        "ho", "room", "roomno", "roomnumber", "unit", "unitno", "unitnumber",
        "destinationho", "destho", "goalho",
    )
    private val FLOOR_KEYS = setOf(
        "floor", "floornumber", "destinationfloor", "destfloor", "goalfloor",
    )
}
