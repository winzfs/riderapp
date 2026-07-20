package com.winzfs.navcapture.overlay

import android.content.Context

enum class OverlayPresentationMode {
    CARD,
    TOP_TICKER,
}

data class OverlayPresentation(
    val mode: OverlayPresentationMode,
    val showDetailedNotification: Boolean,
)

object OverlayPresentationSettings {
    val defaultPresentation = OverlayPresentation(
        mode = OverlayPresentationMode.CARD,
        showDetailedNotification = true,
    )

    fun load(context: Context): OverlayPresentation {
        val preferences = preferences(context)
        val mode = runCatching {
            OverlayPresentationMode.valueOf(
                preferences.getString(KEY_MODE, defaultPresentation.mode.name)
                    ?: defaultPresentation.mode.name,
            )
        }.getOrDefault(defaultPresentation.mode)
        return OverlayPresentation(
            mode = mode,
            showDetailedNotification = preferences.getBoolean(
                KEY_DETAILED_NOTIFICATION,
                defaultPresentation.showDetailedNotification,
            ),
        )
    }

    fun save(context: Context, presentation: OverlayPresentation): OverlayPresentation {
        preferences(context).edit()
            .putString(KEY_MODE, presentation.mode.name)
            .putBoolean(KEY_DETAILED_NOTIFICATION, presentation.showDetailedNotification)
            .apply()
        return presentation
    }

    fun setMode(context: Context, mode: OverlayPresentationMode): OverlayPresentation {
        val current = load(context)
        return save(context, current.copy(mode = mode))
    }

    fun setDetailedNotification(context: Context, enabled: Boolean): OverlayPresentation {
        val current = load(context)
        return save(context, current.copy(showDetailedNotification = enabled))
    }

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    private const val PREFERENCES_NAME = "destination_overlay_presentation"
    private const val KEY_MODE = "mode"
    private const val KEY_DETAILED_NOTIFICATION = "detailed_notification"
}
