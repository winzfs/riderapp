package com.winzfs.navcapture.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class PlaceKeyFactoryTest {
    @Test
    fun sameCoordinateCellUsesSameKey() {
        val first = PlaceKeyFactory.create(35.1595454, 126.8526012, "A", "")
        val second = PlaceKeyFactory.create(35.1595451, 126.8526014, "B", "")

        assertEquals(first, second)
    }

    @Test
    fun differentPlacesUseDifferentKeys() {
        val first = PlaceKeyFactory.create(35.15954, 126.85260, "", "")
        val second = PlaceKeyFactory.create(35.16054, 126.85260, "", "")

        assertNotEquals(first, second)
    }

    @Test
    fun destinationNameIsFallbackWhenCoordinatesAreMissing() {
        val first = PlaceKeyFactory.create(null, null, "  광주   시청 ", "one")
        val second = PlaceKeyFactory.create(null, null, "광주 시청", "two")

        assertEquals(first, second)
    }
}
