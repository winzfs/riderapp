package com.winzfs.navcapture.overlay

import android.content.Context

/**
 * TOP_TICKER is retained as the stored enum name for compatibility with existing installs.
 * It now means notification-only presentation; no fake overlay bar is drawn.
 */
enum class OverlayPresentationMode {
    CARD,
    TOP_TICKER,
}

data class OverlayPresentation(
    val mode: OverlayPresentationMode,
    val showDetailedNotification: Boolean,
    val showHeadsUpNotification: Boolean,
)

object OverlayPresentationSettings {
    val defaultPresentation = OverlayPresentation(
        mode = OverlayPresentationMode.CARD,
        showDetailedNotification = true,
        showHeadsUpNotification = false,
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
            showHeadsUpNotification = preferences.getBoolean(
                KEY_HEADS_UP_NOTIFICATION,
                defaultPresentation.showHeadsUpNotification,
            ),
        )
    }

    fun save(context: Context, presentation: OverlayPresentation): OverlayPresentation {
        preferences(context).edit()
            .putString(KEY_MODE, presentation.mode.name)
            .putBoolean(KEY_DETAILED_NOTIFICATION, presentation.showDetailedNotification)
            .putBoolean(KEY_HEADS_UP_NOTIFICATION, presentation.showHeadsUpNotification)
            .apply()
        return presentation
    }

    fun setMode(context: Context, mode: OverlayPresentationMode): OverlayPresentation {
        val current = load(context)
        return save(
            context,
            current.copy(
                mode = mode,
                showDetailedNotification = if (mode == OverlayPresentationMode.TOP_TICKER) {
                    true
                } else {
                    current.showDetailedNotification
                },
            ),
        )
    }

    fun setDetailedNotification(context: Context, enabled: Boolean): OverlayPresentation {
        val current = load(context)
        return save(context, current.copy(showDetailedNotification = enabled))
    }

    fun setHeadsUpNotification(context: Context, enabled: Boolean): OverlayPresentation {
        val current = load(context)
        return save(context, current.copy(showHeadsUpNotification = enabled))
    }

    fun isNotificationOnly(context: Context): Boolean =
        load(context).mode == OverlayPresentationMode.TOP_TICKER

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    private const val PREFERENCES_NAME = "destination_overlay_presentation"
    private const val KEY_MODE = "mode"
    private const val KEY_DETAILED_NOTIFICATION = "detailed_notification"
    private const val KEY_HEADS_UP_NOTIFICATION = "heads_up_notification"
}
