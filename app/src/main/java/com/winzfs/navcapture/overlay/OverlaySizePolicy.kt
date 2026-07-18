package com.winzfs.navcapture.overlay

data class OverlaySize(
    val widthDp: Int,
    val heightDp: Int,
)

/** Pure size rules shared by the overlay service and unit tests. */
object OverlaySizePolicy {
    const val DEFAULT_WIDTH_DP = 320
    const val DEFAULT_HEIGHT_DP = 280
    const val MIN_WIDTH_DP = 240
    const val MIN_HEIGHT_DP = 180
    const val WIDTH_STEP_DP = 20
    const val HEIGHT_STEP_DP = 20

    fun adjust(
        currentWidthDp: Int,
        currentHeightDp: Int,
        widthDeltaDp: Int,
        heightDeltaDp: Int,
        maxWidthDp: Int,
        maxHeightDp: Int,
    ): OverlaySize {
        val safeMaxWidth = maxOf(MIN_WIDTH_DP, maxWidthDp)
        val safeMaxHeight = maxOf(MIN_HEIGHT_DP, maxHeightDp)
        return OverlaySize(
            widthDp = (currentWidthDp + widthDeltaDp).coerceIn(MIN_WIDTH_DP, safeMaxWidth),
            heightDp = (currentHeightDp + heightDeltaDp).coerceIn(MIN_HEIGHT_DP, safeMaxHeight),
        )
    }

    fun normalizeStored(
        widthDp: Int,
        heightDp: Int,
        maxWidthDp: Int,
        maxHeightDp: Int,
    ): OverlaySize = adjust(
        currentWidthDp = widthDp,
        currentHeightDp = heightDp,
        widthDeltaDp = 0,
        heightDeltaDp = 0,
        maxWidthDp = maxWidthDp,
        maxHeightDp = maxHeightDp,
    )
}
