package com.winzfs.navcapture.overlay

import android.content.Context

/** Persisted overlay appearance. Background, text alpha, typography and outline are independent. */
data class OverlayStyle(
    val backgroundColor: Int,
    val backgroundOpacityPercent: Int,
    val textOpacityPercent: Int,
    val primaryTextColor: Int,
    val secondaryTextColor: Int,
    val accentTextColor: Int,
    val textOutlineColor: Int,
    val textOutlineOpacityPercent: Int,
    val textOutlineWidthDp: Int,
    val addressTextSizeSp: Int,
    val buildingTextSizeSp: Int,
    val unitTextSizeSp: Int,
    val memoTextSizeSp: Int,
)

object OverlayStyleSettings {
    val defaultStyle = OverlayStyle(
        backgroundColor = 0x1B1F27,
        backgroundOpacityPercent = 88,
        textOpacityPercent = 100,
        primaryTextColor = 0xFFFFFF,
        secondaryTextColor = 0xDEE5EF,
        accentTextColor = 0xFFDC8E,
        textOutlineColor = 0x000000,
        textOutlineOpacityPercent = 75,
        textOutlineWidthDp = 0,
        addressTextSizeSp = 18,
        buildingTextSizeSp = 14,
        unitTextSizeSp = 17,
        memoTextSizeSp = 12,
    )

    fun load(context: Context): OverlayStyle {
        val preferences = preferences(context)
        return normalize(
            OverlayStyle(
                backgroundColor = preferences.getInt(
                    KEY_BACKGROUND_COLOR,
                    defaultStyle.backgroundColor,
                ),
                backgroundOpacityPercent = preferences.getInt(
                    KEY_BACKGROUND_OPACITY,
                    defaultStyle.backgroundOpacityPercent,
                ),
                textOpacityPercent = preferences.getInt(
                    KEY_TEXT_OPACITY,
                    defaultStyle.textOpacityPercent,
                ),
                primaryTextColor = preferences.getInt(
                    KEY_PRIMARY_TEXT_COLOR,
                    defaultStyle.primaryTextColor,
                ),
                secondaryTextColor = preferences.getInt(
                    KEY_SECONDARY_TEXT_COLOR,
                    defaultStyle.secondaryTextColor,
                ),
                accentTextColor = preferences.getInt(
                    KEY_ACCENT_TEXT_COLOR,
                    defaultStyle.accentTextColor,
                ),
                textOutlineColor = preferences.getInt(
                    KEY_TEXT_OUTLINE_COLOR,
                    defaultStyle.textOutlineColor,
                ),
                textOutlineOpacityPercent = preferences.getInt(
                    KEY_TEXT_OUTLINE_OPACITY,
                    defaultStyle.textOutlineOpacityPercent,
                ),
                textOutlineWidthDp = preferences.getInt(
                    KEY_TEXT_OUTLINE_WIDTH,
                    defaultStyle.textOutlineWidthDp,
                ),
                addressTextSizeSp = preferences.getInt(
                    KEY_ADDRESS_TEXT_SIZE,
                    defaultStyle.addressTextSizeSp,
                ),
                buildingTextSizeSp = preferences.getInt(
                    KEY_BUILDING_TEXT_SIZE,
                    defaultStyle.buildingTextSizeSp,
                ),
                unitTextSizeSp = preferences.getInt(
                    KEY_UNIT_TEXT_SIZE,
                    defaultStyle.unitTextSizeSp,
                ),
                memoTextSizeSp = preferences.getInt(
                    KEY_MEMO_TEXT_SIZE,
                    defaultStyle.memoTextSizeSp,
                ),
            ),
        )
    }

    fun save(context: Context, style: OverlayStyle): OverlayStyle {
        val normalized = normalize(style)
        preferences(context).edit()
            .putInt(KEY_BACKGROUND_COLOR, normalized.backgroundColor)
            .putInt(KEY_BACKGROUND_OPACITY, normalized.backgroundOpacityPercent)
            .putInt(KEY_TEXT_OPACITY, normalized.textOpacityPercent)
            .putInt(KEY_PRIMARY_TEXT_COLOR, normalized.primaryTextColor)
            .putInt(KEY_SECONDARY_TEXT_COLOR, normalized.secondaryTextColor)
            .putInt(KEY_ACCENT_TEXT_COLOR, normalized.accentTextColor)
            .putInt(KEY_TEXT_OUTLINE_COLOR, normalized.textOutlineColor)
            .putInt(KEY_TEXT_OUTLINE_OPACITY, normalized.textOutlineOpacityPercent)
            .putInt(KEY_TEXT_OUTLINE_WIDTH, normalized.textOutlineWidthDp)
            .putInt(KEY_ADDRESS_TEXT_SIZE, normalized.addressTextSizeSp)
            .putInt(KEY_BUILDING_TEXT_SIZE, normalized.buildingTextSizeSp)
            .putInt(KEY_UNIT_TEXT_SIZE, normalized.unitTextSizeSp)
            .putInt(KEY_MEMO_TEXT_SIZE, normalized.memoTextSizeSp)
            .apply()
        return normalized
    }

    fun reset(context: Context): OverlayStyle = save(context, defaultStyle)

    fun resetTextSizes(context: Context): OverlayStyle {
        val current = load(context)
        return save(
            context,
            current.copy(
                addressTextSizeSp = defaultStyle.addressTextSizeSp,
                buildingTextSizeSp = defaultStyle.buildingTextSizeSp,
                unitTextSizeSp = defaultStyle.unitTextSizeSp,
                memoTextSizeSp = defaultStyle.memoTextSizeSp,
            ),
        )
    }

    fun normalize(style: OverlayStyle): OverlayStyle = style.copy(
        backgroundColor = style.backgroundColor and RGB_MASK,
        backgroundOpacityPercent = style.backgroundOpacityPercent.coerceIn(
            MIN_BACKGROUND_OPACITY_PERCENT,
            MAX_OPACITY_PERCENT,
        ),
        textOpacityPercent = style.textOpacityPercent.coerceIn(
            MIN_TEXT_OPACITY_PERCENT,
            MAX_OPACITY_PERCENT,
        ),
        primaryTextColor = style.primaryTextColor and RGB_MASK,
        secondaryTextColor = style.secondaryTextColor and RGB_MASK,
        accentTextColor = style.accentTextColor and RGB_MASK,
        textOutlineColor = style.textOutlineColor and RGB_MASK,
        textOutlineOpacityPercent = style.textOutlineOpacityPercent.coerceIn(
            0,
            MAX_OPACITY_PERCENT,
        ),
        textOutlineWidthDp = style.textOutlineWidthDp.coerceIn(
            MIN_TEXT_OUTLINE_WIDTH_DP,
            MAX_TEXT_OUTLINE_WIDTH_DP,
        ),
        addressTextSizeSp = style.addressTextSizeSp.coerceIn(
            MIN_ADDRESS_TEXT_SIZE_SP,
            MAX_ADDRESS_TEXT_SIZE_SP,
        ),
        buildingTextSizeSp = style.buildingTextSizeSp.coerceIn(
            MIN_BUILDING_TEXT_SIZE_SP,
            MAX_BUILDING_TEXT_SIZE_SP,
        ),
        unitTextSizeSp = style.unitTextSizeSp.coerceIn(
            MIN_UNIT_TEXT_SIZE_SP,
            MAX_UNIT_TEXT_SIZE_SP,
        ),
        memoTextSizeSp = style.memoTextSizeSp.coerceIn(
            MIN_MEMO_TEXT_SIZE_SP,
            MAX_MEMO_TEXT_SIZE_SP,
        ),
    )

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

    fun muted(color: Int, textOpacityPercent: Int): Int = argb(
        color,
        (textOpacityPercent.coerceIn(0, 100) * 62) / 100,
    )

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    const val OPACITY_STEP_PERCENT = 5
    const val TEXT_OUTLINE_OPACITY_STEP_PERCENT = 10
    const val TEXT_OUTLINE_WIDTH_STEP_DP = 1
    const val TEXT_SIZE_STEP_SP = 1

    const val MIN_BACKGROUND_OPACITY_PERCENT = 0
    const val MIN_TEXT_OPACITY_PERCENT = 20
    const val MAX_OPACITY_PERCENT = 100

    const val MIN_TEXT_OUTLINE_WIDTH_DP = 0
    const val MAX_TEXT_OUTLINE_WIDTH_DP = 3

    const val MIN_ADDRESS_TEXT_SIZE_SP = 12
    const val MAX_ADDRESS_TEXT_SIZE_SP = 28
    const val MIN_BUILDING_TEXT_SIZE_SP = 10
    const val MAX_BUILDING_TEXT_SIZE_SP = 24
    const val MIN_UNIT_TEXT_SIZE_SP = 12
    const val MAX_UNIT_TEXT_SIZE_SP = 30
    const val MIN_MEMO_TEXT_SIZE_SP = 9
    const val MAX_MEMO_TEXT_SIZE_SP = 22

    private const val PREFERENCES_NAME = "destination_overlay_style"
    private const val KEY_BACKGROUND_COLOR = "background_color"
    private const val KEY_BACKGROUND_OPACITY = "background_opacity"
    private const val KEY_TEXT_OPACITY = "text_opacity"
    private const val KEY_PRIMARY_TEXT_COLOR = "primary_text_color"
    private const val KEY_SECONDARY_TEXT_COLOR = "secondary_text_color"
    private const val KEY_ACCENT_TEXT_COLOR = "accent_text_color"
    private const val KEY_TEXT_OUTLINE_COLOR = "text_outline_color"
    private const val KEY_TEXT_OUTLINE_OPACITY = "text_outline_opacity"
    private const val KEY_TEXT_OUTLINE_WIDTH = "text_outline_width"
    private const val KEY_ADDRESS_TEXT_SIZE = "address_text_size_sp"
    private const val KEY_BUILDING_TEXT_SIZE = "building_text_size_sp"
    private const val KEY_UNIT_TEXT_SIZE = "unit_text_size_sp"
    private const val KEY_MEMO_TEXT_SIZE = "memo_text_size_sp"
    private const val RGB_MASK = 0xFFFFFF
    private const val HEX_DIGITS = "0123456789abcdefABCDEF"
}
