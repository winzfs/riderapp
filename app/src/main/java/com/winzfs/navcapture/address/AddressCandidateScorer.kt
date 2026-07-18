package com.winzfs.navcapture.address

import java.util.Locale
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

object AddressCandidateScorer {
    data class Candidate(
        val placeName: String,
        val originalAddress: String,
        val roadAddress: String,
        val latitude: Double?,
        val longitude: Double?,
    )

    fun chooseBest(
        destinationName: String,
        targetLatitude: Double,
        targetLongitude: Double,
        candidates: List<Candidate>,
    ): Candidate? = candidates.maxByOrNull { candidate ->
        score(destinationName, targetLatitude, targetLongitude, candidate)
    }

    fun score(
        destinationName: String,
        targetLatitude: Double,
        targetLongitude: Double,
        candidate: Candidate,
    ): Double {
        val safeDestinationName = KoreanAddressTextParser.searchQuery(destinationName)
        val destination = normalize(safeDestinationName)
        val safeFeatureName = candidate.placeName.takeUnless {
            KoreanAddressTextParser.isUnitOnlyFeature(it)
        }.orEmpty()
        val feature = normalize(safeFeatureName)
        val searchable = normalize(
            listOf(safeFeatureName, candidate.originalAddress, candidate.roadAddress)
                .joinToString(" "),
        )

        var score = 0.0
        if (candidate.roadAddress.isNotBlank()) score += 12.0
        if (destination.isNotBlank() && !isGenericDestination(destination)) {
            if (searchable.contains(destination)) score += 120.0
            if (feature.isNotBlank() && (feature.contains(destination) || destination.contains(feature))) {
                score += 70.0
            }
            tokenize(safeDestinationName).forEach { token ->
                if (searchable.contains(normalize(token))) score += 22.0
            }
        }

        val candidateLatitude = candidate.latitude
        val candidateLongitude = candidate.longitude
        if (candidateLatitude != null && candidateLongitude != null) {
            val distance = distanceMeters(
                targetLatitude,
                targetLongitude,
                candidateLatitude,
                candidateLongitude,
            )
            score -= min(distance / 35.0, 90.0)
        }
        return score
    }

    fun isMeaningfulDestinationName(value: String): Boolean {
        val normalized = normalize(KoreanAddressTextParser.searchQuery(value))
        return normalized.length >= 2 && !isGenericDestination(normalized)
    }

    private fun tokenize(value: String): List<String> = value
        .split(TOKEN_SEPARATOR)
        .map(String::trim)
        .filter { it.length >= 2 }
        .filterNot { KoreanAddressTextParser.isUnitOnlyFeature(it) }
        .filterNot { normalize(it) in GENERIC_TOKENS }
        .distinct()

    private fun normalize(value: String): String = value
        .trim()
        .lowercase(Locale.ROOT)
        .replace(NON_WORD, "")

    private fun isGenericDestination(value: String): Boolean = value in GENERIC_TOKENS

    private fun distanceMeters(
        latitude1: Double,
        longitude1: Double,
        latitude2: Double,
        longitude2: Double,
    ): Double {
        val earthRadius = 6_371_000.0
        val latitudeDelta = Math.toRadians(latitude2 - latitude1)
        val longitudeDelta = Math.toRadians(longitude2 - longitude1)
        val a = sin(latitudeDelta / 2).pow(2) +
            cos(Math.toRadians(latitude1)) * cos(Math.toRadians(latitude2)) *
            sin(longitudeDelta / 2).pow(2)
        return earthRadius * 2 * asin(sqrt(a))
    }

    private val TOKEN_SEPARATOR = Regex("[\\s,()\\[\\]{}·/\\-]+")
    private val NON_WORD = Regex("[^0-9a-z가-힣]")
    private val GENERIC_TOKENS = setOf(
        "목적지",
        "배달지",
        "도착지",
        "고객주소",
        "고객지",
        "배달목적지",
        "도착",
    )
}
