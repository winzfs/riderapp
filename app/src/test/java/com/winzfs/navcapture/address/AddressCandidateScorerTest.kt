package com.winzfs.navcapture.address

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AddressCandidateScorerTest {
    @Test
    fun destinationNameCanBeatSlightlyCloserWrongBuilding() {
        val wrong = AddressCandidateScorer.Candidate(
            placeName = "광주광역시의회",
            originalAddress = "광주 서구 내방동 111",
            roadAddress = "광주 서구 내방로 109",
            latitude = 35.15955,
            longitude = 126.85260,
        )
        val matching = AddressCandidateScorer.Candidate(
            placeName = "광주광역시청",
            originalAddress = "광주 서구 치평동 1200",
            roadAddress = "광주 서구 내방로 111",
            latitude = 35.15960,
            longitude = 126.85270,
        )

        val selected = AddressCandidateScorer.chooseBest(
            destinationName = "광주광역시청",
            targetLatitude = 35.1595454,
            targetLongitude = 126.8526012,
            candidates = listOf(wrong, matching),
        )

        assertEquals(matching, selected)
    }

    @Test
    fun genericDestinationPrefersNearbyRoadAddress() {
        val nearby = AddressCandidateScorer.Candidate(
            placeName = "",
            originalAddress = "광주 광산구 수완동 1",
            roadAddress = "광주 광산구 임방울대로 1",
            latitude = 35.19001,
            longitude = 126.82401,
        )
        val far = nearby.copy(
            roadAddress = "광주 광산구 임방울대로 99",
            latitude = 35.20000,
            longitude = 126.83400,
        )

        val selected = AddressCandidateScorer.chooseBest(
            destinationName = "배달지",
            targetLatitude = 35.19000,
            targetLongitude = 126.82400,
            candidates = listOf(far, nearby),
        )

        assertEquals(nearby, selected)
    }

    @Test
    fun recognizesGenericAndMeaningfulNames() {
        assertTrue(!AddressCandidateScorer.isMeaningfulDestinationName("목적지"))
        assertTrue(AddressCandidateScorer.isMeaningfulDestinationName("수완센트럴병원"))
    }
}