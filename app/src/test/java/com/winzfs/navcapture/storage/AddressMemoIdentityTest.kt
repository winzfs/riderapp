package com.winzfs.navcapture.storage

import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.model.CapturedDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AddressMemoIdentityTest {
    @Test
    fun spacingVariantsUseSameAddressIdentity() {
        val variants = listOf(
            "광주광역시 광산구 수완로 24번길 84",
            "광주광역시 광산구 수완로24번길 84",
            "광주광역시 광산구 수완로 24번길84",
            "광주광역시 광산구 수완로 24 번 길 84",
        )

        val keys = variants.map { address ->
            AddressMemoIdentity.forCapture(capture(address, latitude = 35.18, longitude = 126.82))
        }.toSet()

        assertEquals(1, keys.size)
        assertTrue(keys.single().startsWith("address:"))
    }

    @Test
    fun dongAndHoDoNotCreateAnotherMemo() {
        val first = AddressMemoIdentity.forCapture(
            capture("광주광역시 광산구 수완로 24번길 84 101동 1001호", 35.18, 126.82),
        )
        val second = AddressMemoIdentity.forCapture(
            capture("광주광역시 광산구 수완로24번길84 105동 1203호", 35.1802, 126.8202),
        )

        assertEquals(first, second)
    }

    @Test
    fun duplicateEntriesMergeAndKeepExistingMemo() {
        val newer = entry(
            id = "new",
            roadAddress = "광주광역시 광산구 수완로24번길 84",
            memo = "",
            updatedAt = 200,
        )
        val older = entry(
            id = "old",
            roadAddress = "광주광역시 광산구 수완로 24번길84",
            memo = "후문으로 진입",
            updatedAt = 100,
        )

        val result = AddressMemoDeduplicator.deduplicate(listOf(newer, older))

        assertEquals(1, result.size)
        assertEquals("new", result.single().id)
        assertEquals("후문으로 진입", result.single().memo)
    }

    private fun capture(
        name: String,
        latitude: Double,
        longitude: Double,
    ): CapturedDestination = CapturedDestination(
        capturedAt = 1,
        action = "android.intent.action.VIEW",
        rawUri = "",
        scheme = "intent-extra",
        host = "",
        path = "",
        latitude = latitude,
        longitude = longitude,
        destinationName = name,
        format = "test",
        extrasText = "",
        flags = 0,
        categories = "",
    )

    private fun entry(
        id: String,
        roadAddress: String,
        memo: String,
        updatedAt: Long,
    ): AddressMemoEntry = AddressMemoEntry(
        id = id,
        placeKey = "legacy:$id",
        sourceText = roadAddress,
        sourcePayloadText = "",
        placeName = "",
        address = "",
        roadAddress = roadAddress,
        unitDetail = "",
        roadAddressConfirmed = false,
        memo = memo,
        latitude = null,
        longitude = null,
        createdAt = updatedAt,
        updatedAt = updatedAt,
    )
}
