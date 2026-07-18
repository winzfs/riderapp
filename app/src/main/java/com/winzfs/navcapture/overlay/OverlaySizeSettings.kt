package com.winzfs.navcapture.overlay

import android.content.Context

/** Persists overlay size independently from the visible overlay service. */
object OverlaySizeSettings {
    fun load(context: Context): OverlaySize {
        val preferences = preferences(context)
        val normalized = OverlaySizePolicy.normalizeStored(
            widthDp = preferences.getInt(KEY_WIDTH_DP, OverlaySizePolicy.DEFAULT_WIDTH_DP),
            heightDp = preferences.getInt(KEY_HEIGHT_DP, OverlaySizePolicy.DEFAULT_HEIGHT_DP),
            maxWidthDp = maxWidthDp(context),
            maxHeightDp = maxHeightDp(context),
        )
        save(context, normalized)
        return normalized
    }

    fun adjust(
        context: Context,
        widthDeltaDp: Int,
        heightDeltaDp: Int,
    ): OverlaySize {
        val current = load(context)
        val adjusted = OverlaySizePolicy.adjust(
            currentWidthDp = current.widthDp,
            currentHeightDp = current.heightDp,
            widthDeltaDp = widthDeltaDp,
            heightDeltaDp = heightDeltaDp,
            maxWidthDp = maxWidthDp(context),
            maxHeightDp = maxHeightDp(context),
        )
        save(context, adjusted)
        return adjusted
    }

    fun reset(context: Context): OverlaySize = saveNormalized(
        context = context,
        widthDp = OverlaySizePolicy.DEFAULT_WIDTH_DP,
        heightDp = OverlaySizePolicy.DEFAULT_HEIGHT_DP,
    )

    fun saveNormalized(
        context: Context,
        widthDp: Int,
        heightDp: Int,
    ): OverlaySize {
        val normalized = OverlaySizePolicy.normalizeStored(
            widthDp = widthDp,
            heightDp = heightDp,
            maxWidthDp = maxWidthDp(context),
            maxHeightDp = maxHeightDp(context),
        )
        save(context, normalized)
        return normalized
    }

    private fun save(context: Context, size: OverlaySize) {
        preferences(context).edit()
            .putInt(KEY_WIDTH_DP, size.widthDp)
            .putInt(KEY_HEIGHT_DP, size.heightDp)
            .apply()
    }

    private fun maxWidthDp(context: Context): Int {
        val screenWidthDp = pxToDp(context, context.resources.displayMetrics.widthPixels)
        return (screenWidthDp - 16).coerceAtLeast(OverlaySizePolicy.MIN_WIDTH_DP)
    }

    private fun maxHeightDp(context: Context): Int {
        val screenHeightDp = pxToDp(context, context.resources.displayMetrics.heightPixels)
        return (screenHeightDp - 120).coerceAtLeast(OverlaySizePolicy.MIN_HEIGHT_DP)
    }

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    private fun pxToDp(context: Context, value: Int): Int =
        (value / context.resources.displayMetrics.density).toInt()

    private const val PREFERENCES_NAME = "destination_overlay_size"
    private const val KEY_WIDTH_DP = "width_dp"
    private const val KEY_HEIGHT_DP = "height_dp"
}
