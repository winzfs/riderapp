package com.winzfs.navcapture.overlay

import android.content.Context

/** Persisted visual style shared by the settings screen and overlay service. */
data class OverlayStyle(
    val backgroundColor: Int,
    val backgroundOpacityPercent: Int,
    val primaryTextColor: Int,
    val secondaryTextColor: Int,
    val accentTextColor: Int,
    val outlineColor: Int,
    val outlineOpacityPercent: Int,
    val outlineWidthDp: Int,
)

object OverlayStyleSettings {
    val defaultStyle = OverlayStyle(
        backgroundColor = 0x1B1F27,
        backgroundOpacityPercent = 94,
        primaryTextColor = 0xFFFFFF,
        secondaryTextColor = 0xDEE5EF,
        accentTextColor = 0xFFDC8E,
        outlineColor = 0xFFFFFF,
        outlineOpacityPercent = 45,
        outlineWidthDp = 1,
    )

    fun load(context: Context): OverlayStyle {
        val preferences = preferences(context)
        return OverlayStyle(
            backgroundColor = preferences.getInt(KEY_BACKGROUND_COLOR, defaultStyle.backgroundColor) and RGB_MASK,
            backgroundOpacityPercent = preferences.getInt(
                KEY_BACKGROUND_OPACITY,
                defaultStyle.backgroundOpacityPercent,
            ).coerceIn(MIN_OPACITY_PERCENT, MAX_OPACITY_PERCENT),
            primaryTextColor = preferences.getInt(KEY_PRIMARY_TEXT_COLOR, defaultStyle.primaryTextColor) and RGB_MASK,
            secondaryTextColor = preferences.getInt(
                KEY_SECONDARY_TEXT_COLOR,
                defaultStyle.secondaryTextColor,
            ) and RGB_MASK,
            accentTextColor = preferences.getInt(KEY_ACCENT_TEXT_COLOR, defaultStyle.accentTextColor) and RGB_MASK,
            outlineColor = preferences.getInt(KEY_OUTLINE_COLOR, defaultStyle.outlineColor) and RGB_MASK,
            outlineOpacityPercent = preferences.getInt(
                KEY_OUTLINE_OPACITY,
                defaultStyle.outlineOpacityPercent,
            ).coerceIn(0, MAX_OPACITY_PERCENT),
            outlineWidthDp = preferences.getInt(KEY_OUTLINE_WIDTH, defaultStyle.outlineWidthDp)
                .coerceIn(MIN_OUTLINE_WIDTH_DP, MAX_OUTLINE_WIDTH_DP),
        )
    }

    fun save(context: Context, style: OverlayStyle): OverlayStyle {
        val normalized = style.copy(
            backgroundColor = style.backgroundColor and RGB_MASK,
            backgroundOpacityPercent = style.backgroundOpacityPercent.coerceIn(
                MIN_OPACITY_PERCENT,
                MAX_OPACITY_PERCENT,
            ),
            primaryTextColor = style.primaryTextColor and RGB_MASK,
            secondaryTextColor = style.secondaryTextColor and RGB_MASK,
            accentTextColor = style.accentTextColor and RGB_MASK,
            outlineColor = style.outlineColor and RGB_MASK,
            outlineOpacityPercent = style.outlineOpacityPercent.coerceIn(0, MAX_OPACITY_PERCENT),
            outlineWidthDp = style.outlineWidthDp.coerceIn(
                MIN_OUTLINE_WIDTH_DP,
                MAX_OUTLINE_WIDTH_DP,
            ),
        )
        preferences(context).edit()
            .putInt(KEY_BACKGROUND_COLOR, normalized.backgroundColor)
            .putInt(KEY_BACKGROUND_OPACITY, normalized.backgroundOpacityPercent)
            .putInt(KEY_PRIMARY_TEXT_COLOR, normalized.primaryTextColor)
            .putInt(KEY_SECONDARY_TEXT_COLOR, normalized.secondaryTextColor)
            .putInt(KEY_ACCENT_TEXT_COLOR, normalized.accentTextColor)
            .putInt(KEY_OUTLINE_COLOR, normalized.outlineColor)
            .putInt(KEY_OUTLINE_OPACITY, normalized.outlineOpacityPercent)
            .putInt(KEY_OUTLINE_WIDTH, normalized.outlineWidthDp)
            .apply()
        return normalized
    }

    fun reset(context: Context): OverlayStyle = save(context, defaultStyle)

    fun parseHex(value: String): Int? {
        val normalized = value.trim().removePrefix("#")
        if (normalized.length != 6 || normalized.any { it !in HEX_DIGITS }) return null
        return normalized.toIntOrNull(16)?.and(RGB_MASK)
    }

    fun formatHex(color: Int): String = "#%06X".format(color and RGB_MASK)

    fun argb(color: Int, opacityPercent: Int): Int {
        val alpha = ((opacityPercent.coerceIn(0, 100) / 100f) * 255f).toInt()
        return (alpha shl 24) or (color and RGB_MASK)
    }

    fun muted(color: Int): Int = argb(color, 65)

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    const val OPACITY_STEP_PERCENT = 5
    const val OUTLINE_OPACITY_STEP_PERCENT = 10
    const val OUTLINE_WIDTH_STEP_DP = 1
    const val MIN_OPACITY_PERCENT = 20
    const val MAX_OPACITY_PERCENT = 100
    const val MIN_OUTLINE_WIDTH_DP = 0
    const val MAX_OUTLINE_WIDTH_DP = 5

    private const val PREFERENCES_NAME = "destination_overlay_style"
    private const val KEY_BACKGROUND_COLOR = "background_color"
    private const val KEY_BACKGROUND_OPACITY = "background_opacity"
    private const val KEY_PRIMARY_TEXT_COLOR = "primary_text_color"
    private const val KEY_SECONDARY_TEXT_COLOR = "secondary_text_color"
    private const val KEY_ACCENT_TEXT_COLOR = "accent_text_color"
    private const val KEY_OUTLINE_COLOR = "outline_color"
    private const val KEY_OUTLINE_OPACITY = "outline_opacity"
    private const val KEY_OUTLINE_WIDTH = "outline_width"
    private const val RGB_MASK = 0xFFFFFF
    private const val HEX_DIGITS = "0123456789abcdefABCDEF"
}
