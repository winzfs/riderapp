package com.winzfs.navcapture.parser

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Pure Kotlin URI parser so the important destination extraction logic can be
 * tested without an Android device or Android framework classes.
 */
class RawNavigationUriParser {

    fun parse(rawUri: String): ParsedNavigationUri {
        if (rawUri.isBlank()) return ParsedNavigationUri(format = "unknown")

        val structure = parseStructure(rawUri)
        val params = parseQuery(rawUri)
        val destination = when (structure.scheme) {
            "geo" -> parseGeo(rawUri, params)
            "kakaomap" -> parseKakao(structure.host, params)
            "nmap" -> parseNaver(structure.host, params)
            "tmap" -> parseTmap(params)
            "http", "https" -> parseWeb(structure.host, structure.path, params)
            else -> Destination(format = structure.scheme.ifBlank { "unknown" })
        }

        return ParsedNavigationUri(
            scheme = structure.scheme,
            host = structure.host,
            path = structure.path,
            latitude = destination.latitude,
            longitude = destination.longitude,
            destinationName = destination.name,
            format = destination.format,
        )
    }

    private fun parseGeo(rawUri: String, params: Map<String, String>): Destination {
        val body = rawUri.substringAfter(':', "").substringBefore('?')
        val baseCoordinates = parseCoordinatePair(body)
        val query = params["q"].orEmpty()
        val queryMatch = COORDINATE_WITH_LABEL.find(query)
        val queryCoordinates = queryMatch?.let {
            val lat = it.groupValues[1].toDoubleOrNull()
            val lng = it.groupValues[2].toDoubleOrNull()
            if (lat != null && lng != null) lat to lng else null
        }
        val name = queryMatch?.groupValues?.getOrNull(3).orEmpty().ifBlank {
            query.takeUnless { parseCoordinatePair(it) != null }.orEmpty()
        }
        val coordinates = queryCoordinates
            ?: baseCoordinates?.takeUnless { it.first == 0.0 && it.second == 0.0 }

        return Destination(
            latitude = coordinates?.first,
            longitude = coordinates?.second,
            name = name,
            format = "Android geo URI",
        )
    }

    private fun parseKakao(host: String, params: Map<String, String>): Destination {
        val point = when (host) {
            "route" -> parseCoordinatePair(params["ep"].orEmpty())
            "look", "roadview" -> parseCoordinatePair(params["p"].orEmpty())
            "search" -> parseCoordinatePair(params["p"].orEmpty())
            else -> parseCoordinatePair(params["ep"].orEmpty())
                ?: parseCoordinatePair(params["p"].orEmpty())
        }
        return Destination(
            latitude = point?.first,
            longitude = point?.second,
            name = firstNonBlank(
                params["ep_name"], params["ename"], params["name"], params["q"],
            ),
            format = "Kakao Map URI",
        )
    }

    private fun parseNaver(host: String, params: Map<String, String>): Destination {
        return Destination(
            latitude = firstDouble(params, "dlat", "lat", "goalLat", "goaly"),
            longitude = firstDouble(params, "dlng", "lng", "goalLng", "goalx"),
            name = firstNonBlank(params["dname"], params["name"], params["query"]),
            format = "NAVER Map URI${host.takeIf { it.isNotBlank() }?.let { " ($it)" }.orEmpty()}",
        )
    }

    private fun parseTmap(params: Map<String, String>): Destination {
        return Destination(
            latitude = firstDouble(
                params, "rGoY", "rgoY", "rgoy", "goalY", "goaly", "dlat", "lat",
            ),
            longitude = firstDouble(
                params, "rGoX", "rgoX", "rgox", "goalX", "goalx", "dlng", "lng",
            ),
            name = firstNonBlank(
                params["rGoName"], params["rgoname"], params["goalName"],
                params["goalname"], params["dname"], params["name"],
            ),
            format = "TMAP URI",
        )
    }

    private fun parseWeb(
        host: String,
        path: String,
        params: Map<String, String>,
    ): Destination {
        if (host == "m.map.kakao.com") {
            val point = parseCoordinatePair(params["ep"].orEmpty())
                ?: parseCoordinatePair(params["p"].orEmpty())
            return Destination(
                latitude = point?.first,
                longitude = point?.second,
                name = firstNonBlank(params["q"], params["name"]),
                format = "Kakao mobile web URI",
            )
        }

        if (host == "map.kakao.com") {
            val match = KAKAO_LINK_TO.find(path)
            if (match != null) {
                return Destination(
                    latitude = match.groupValues[2].toDoubleOrNull(),
                    longitude = match.groupValues[3].toDoubleOrNull(),
                    name = decode(match.groupValues[1]),
                    format = "Kakao link URL",
                )
            }
        }
        return Destination(format = "Web URL")
    }

    private fun parseStructure(rawUri: String): UriStructure {
        val scheme = rawUri.substringBefore(':', "").lowercase()
        val afterScheme = rawUri.substringAfter(':', "")
        if (!afterScheme.startsWith("//")) {
            return UriStructure(scheme = scheme)
        }
        val hierarchical = afterScheme.removePrefix("//")
        val authority = hierarchical.substringBeforeAny('/', '?', '#').lowercase()
        val afterAuthority = hierarchical.drop(authority.length)
        val path = afterAuthority.substringBefore('?').substringBefore('#')
        return UriStructure(scheme = scheme, host = authority, path = path)
    }

    private fun parseQuery(rawUri: String): Map<String, String> {
        val query = rawUri.substringAfter('?', "").substringBefore('#')
        if (query.isBlank()) return emptyMap()
        return query.split('&')
            .mapNotNull { part ->
                if (part.isBlank()) return@mapNotNull null
                decode(part.substringBefore('=')) to decode(part.substringAfter('=', ""))
            }
            .toMap()
    }

    private fun parseCoordinatePair(value: String): Pair<Double, Double>? {
        val match = COORDINATE_PAIR.find(value.trim()) ?: return null
        val lat = match.groupValues[1].toDoubleOrNull() ?: return null
        val lng = match.groupValues[2].toDoubleOrNull() ?: return null
        return lat to lng
    }

    private fun firstDouble(params: Map<String, String>, vararg keys: String): Double? {
        for (key in keys) {
            params[key]?.toDoubleOrNull()?.let { return it }
            params.entries.firstOrNull { it.key.equals(key, ignoreCase = true) }
                ?.value?.toDoubleOrNull()?.let { return it }
        }
        return null
    }

    private fun firstNonBlank(vararg values: String?): String =
        values.firstOrNull { !it.isNullOrBlank() }.orEmpty()

    private fun decode(value: String): String = runCatching {
        URLDecoder.decode(value, StandardCharsets.UTF_8.name())
    }.getOrDefault(value)

    private fun String.substringBeforeAny(vararg delimiters: Char): String {
        val index = delimiters.map { indexOf(it) }.filter { it >= 0 }.minOrNull() ?: length
        return substring(0, index)
    }

    private data class UriStructure(
        val scheme: String,
        val host: String = "",
        val path: String = "",
    )

    private data class Destination(
        val latitude: Double? = null,
        val longitude: Double? = null,
        val name: String = "",
        val format: String,
    )

    companion object {
        private val COORDINATE_PAIR = Regex("^\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)")
        private val COORDINATE_WITH_LABEL = Regex(
            "^\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)(?:\\((.*)\\))?\\s*$"
        )
        private val KAKAO_LINK_TO = Regex(
            "/link/to/([^,]+),(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)"
        )
    }
}

data class ParsedNavigationUri(
    val scheme: String = "",
    val host: String = "",
    val path: String = "",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val destinationName: String = "",
    val format: String,
)
