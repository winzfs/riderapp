package com.winzfs.navcapture.address

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.Locale
import java.util.concurrent.Executors

class RoadAddressResolver(context: Context) {
    data class ResolvedAddress(
        val placeName: String,
        val originalAddress: String,
        val roadAddress: String,
        val latitude: Double?,
        val longitude: Double?,
    )

    private val geocoder = Geocoder(context.applicationContext, Locale.KOREA)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    fun resolve(
        destinationName: String,
        latitude: Double,
        longitude: Double,
        callback: (Result<ResolvedAddress>) -> Unit,
    ) {
        if (!Geocoder.isPresent()) {
            callback(Result.failure(IllegalStateException("이 휴대폰에는 주소 변환 기능이 없습니다.")))
            return
        }

        val safeQuery = KoreanAddressTextParser.searchQuery(destinationName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            geocoder.getFromLocation(
                latitude,
                longitude,
                MAX_RESULTS,
                object : Geocoder.GeocodeListener {
                    override fun onGeocode(reverseResults: MutableList<Address>) {
                        if (AddressCandidateScorer.isMeaningfulDestinationName(safeQuery)) {
                            searchNameNearCoordinates(
                                safeQuery,
                                latitude,
                                longitude,
                                reverseResults,
                                callback,
                            )
                        } else {
                            finishResolve(
                                safeQuery,
                                latitude,
                                longitude,
                                reverseResults,
                                callback,
                            )
                        }
                    }

                    override fun onError(errorMessage: String?) {
                        callbackOnMain(
                            callback,
                            Result.failure(
                                IllegalStateException(errorMessage ?: "주소 후보를 찾지 못했습니다."),
                            ),
                        )
                    }
                },
            )
        } else {
            executor.execute {
                val result = runCatching {
                    @Suppress("DEPRECATION")
                    val reverse = geocoder.getFromLocation(latitude, longitude, MAX_RESULTS).orEmpty()
                    @Suppress("DEPRECATION")
                    val named = if (AddressCandidateScorer.isMeaningfulDestinationName(safeQuery)) {
                        geocoder.getFromLocationName(
                            safeQuery,
                            MAX_RESULTS,
                            latitude - SEARCH_RADIUS_DEGREES,
                            longitude - SEARCH_RADIUS_DEGREES,
                            latitude + SEARCH_RADIUS_DEGREES,
                            longitude + SEARCH_RADIUS_DEGREES,
                        ).orEmpty()
                    } else {
                        emptyList()
                    }
                    chooseResolved(safeQuery, latitude, longitude, reverse + named)
                        ?: throw IllegalStateException("도로명주소 후보를 찾지 못했습니다.")
                }
                callbackOnMain(callback, result)
            }
        }
    }

    fun search(
        query: String,
        callback: (Result<List<ResolvedAddress>>) -> Unit,
    ) {
        val keyword = KoreanAddressTextParser.searchQuery(query)
        if (keyword.isBlank()) {
            callback(Result.failure(IllegalArgumentException("검색할 주소나 장소명을 입력해 주세요.")))
            return
        }
        if (!Geocoder.isPresent()) {
            callback(Result.failure(IllegalStateException("이 휴대폰에는 주소 검색 기능이 없습니다.")))
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            geocoder.getFromLocationName(
                keyword,
                MAX_RESULTS,
                object : Geocoder.GeocodeListener {
                    override fun onGeocode(addresses: MutableList<Address>) {
                        callbackOnMain(
                            callback,
                            Result.success(addresses.map(::toResolved).distinctBy(::candidateKey)),
                        )
                    }

                    override fun onError(errorMessage: String?) {
                        callbackOnMain(
                            callback,
                            Result.failure(
                                IllegalStateException(errorMessage ?: "주소 검색 결과가 없습니다."),
                            ),
                        )
                    }
                },
            )
        } else {
            executor.execute {
                val result = runCatching {
                    @Suppress("DEPRECATION")
                    geocoder.getFromLocationName(keyword, MAX_RESULTS)
                        .orEmpty()
                        .map(::toResolved)
                        .distinctBy(::candidateKey)
                }
                callbackOnMain(callback, result)
            }
        }
    }

    private fun searchNameNearCoordinates(
        destinationName: String,
        latitude: Double,
        longitude: Double,
        reverseResults: List<Address>,
        callback: (Result<ResolvedAddress>) -> Unit,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        geocoder.getFromLocationName(
            destinationName,
            MAX_RESULTS,
            latitude - SEARCH_RADIUS_DEGREES,
            longitude - SEARCH_RADIUS_DEGREES,
            latitude + SEARCH_RADIUS_DEGREES,
            longitude + SEARCH_RADIUS_DEGREES,
            object : Geocoder.GeocodeListener {
                override fun onGeocode(namedResults: MutableList<Address>) {
                    finishResolve(
                        destinationName,
                        latitude,
                        longitude,
                        reverseResults + namedResults,
                        callback,
                    )
                }

                override fun onError(errorMessage: String?) {
                    finishResolve(
                        destinationName,
                        latitude,
                        longitude,
                        reverseResults,
                        callback,
                    )
                }
            },
        )
    }

    private fun finishResolve(
        destinationName: String,
        latitude: Double,
        longitude: Double,
        addresses: List<Address>,
        callback: (Result<ResolvedAddress>) -> Unit,
    ) {
        val resolved = chooseResolved(destinationName, latitude, longitude, addresses)
        callbackOnMain(
            callback,
            resolved?.let(Result.Companion::success)
                ?: Result.failure(IllegalStateException("도로명주소 후보를 찾지 못했습니다.")),
        )
    }

    private fun chooseResolved(
        destinationName: String,
        latitude: Double,
        longitude: Double,
        addresses: List<Address>,
    ): ResolvedAddress? {
        val resolved = addresses
            .map(::toResolved)
            .filter { it.roadAddress.isNotBlank() || it.originalAddress.isNotBlank() }
            .distinctBy(::candidateKey)
        val candidates = resolved.map { item ->
            AddressCandidateScorer.Candidate(
                placeName = item.placeName,
                originalAddress = item.originalAddress,
                roadAddress = item.roadAddress,
                latitude = item.latitude,
                longitude = item.longitude,
            )
        }
        val best = AddressCandidateScorer.chooseBest(
            destinationName,
            latitude,
            longitude,
            candidates,
        ) ?: return null
        return resolved.firstOrNull { candidate ->
            candidate.placeName == best.placeName &&
                candidate.originalAddress == best.originalAddress &&
                candidate.roadAddress == best.roadAddress
        }
    }

    private fun toResolved(address: Address): ResolvedAddress {
        val fullLine = cleanAddressLine(
            if (address.maxAddressLineIndex >= 0) address.getAddressLine(0).orEmpty() else "",
        )
        val assembledRoad = listOfNotNull(
            address.adminArea,
            address.subAdminArea,
            address.locality,
            address.subLocality,
            address.thoroughfare,
            address.subThoroughfare,
        )
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .joinToString(" ")

        val roadAddress = KoreanAddressTextParser.extractRoadAddress(fullLine)
            .ifBlank { KoreanAddressTextParser.extractRoadAddress(assembledRoad) }
        val originalAddress = KoreanAddressTextParser.extractLotAddress(fullLine)
            .ifBlank { fullLine.ifBlank { assembledRoad } }
        val rawFeatureName = address.featureName.orEmpty().trim()
        val safeFeatureName = rawFeatureName.takeUnless {
            KoreanAddressTextParser.isUnitOnlyFeature(it)
        }.orEmpty()

        return ResolvedAddress(
            placeName = safeFeatureName,
            originalAddress = originalAddress,
            roadAddress = roadAddress,
            latitude = if (address.hasLatitude()) address.latitude else null,
            longitude = if (address.hasLongitude()) address.longitude else null,
        )
    }

    private fun cleanAddressLine(value: String): String = value
        .replace(COUNTRY_PREFIX, "")
        .replace(POSTAL_PREFIX, "")
        .trim()

    private fun candidateKey(value: ResolvedAddress): String =
        "${value.placeName}|${value.originalAddress}|${value.roadAddress}"

    private fun <T> callbackOnMain(
        callback: (Result<T>) -> Unit,
        result: Result<T>,
    ) {
        mainHandler.post { callback(result) }
    }

    companion object {
        private const val MAX_RESULTS = 5
        private const val SEARCH_RADIUS_DEGREES = 0.025
        private val COUNTRY_PREFIX = Regex("^(대한민국|South Korea|Republic of Korea)\\s*")
        private val POSTAL_PREFIX = Regex("^\\d{5}\\s+")
    }
}
