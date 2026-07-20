package com.winzfs.navcapture.overlay

import android.content.Context
import android.provider.Settings
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.storage.AddressMemoStore

/**
 * Chooses the real Android presentation path.
 *
 * CARD uses TYPE_APPLICATION_OVERLAY plus the required ongoing notification.
 * The legacy TOP_TICKER stored value now means a system-notification-only mode.
 */
object DestinationDisplayController {
    fun show(context: Context, entry: AddressMemoEntry): Boolean {
        DisplaySessionStore.saveEntry(context, entry.id)
        if (!OverlayPresentationSettings.isNotificationOnly(context) &&
            !Settings.canDrawOverlays(context)
        ) {
            DestinationOverlayService.hide(context)
            return false
        }
        DestinationOverlayService.show(context, entry)
        return true
    }

    fun showPreview(
        context: Context,
        address: String,
        buildingName: String,
        unitDetail: String,
        memo: String,
    ): Boolean {
        DisplaySessionStore.savePreview(context, address, buildingName, unitDetail, memo)
        if (!OverlayPresentationSettings.isNotificationOnly(context) &&
            !Settings.canDrawOverlays(context)
        ) {
            DestinationOverlayService.hide(context)
            return false
        }
        DestinationOverlayService.showPreview(
            context = context,
            address = address,
            buildingName = buildingName,
            unitDetail = unitDetail,
            memo = memo,
        )
        return true
    }

    fun refreshPresentation(context: Context) {
        when (val session = DisplaySessionStore.load(context)) {
            is DisplaySession.Entry -> {
                AddressMemoStore(context).findById(session.entryId)?.let { show(context, it) }
            }

            is DisplaySession.Preview -> showPreview(
                context = context,
                address = session.address,
                buildingName = session.buildingName,
                unitDetail = session.unitDetail,
                memo = session.memo,
            )

            null -> DestinationOverlayService.hide(context)
        }
    }

    fun refreshStyle(context: Context) {
        DestinationOverlayService.refreshStyle(context)
    }

    fun hide(context: Context) {
        DisplaySessionStore.clear(context)
        DestinationOverlayService.hide(context)
    }
}

private sealed interface DisplaySession {
    data class Entry(val entryId: String) : DisplaySession
    data class Preview(
        val address: String,
        val buildingName: String,
        val unitDetail: String,
        val memo: String,
    ) : DisplaySession
}

private object DisplaySessionStore {
    fun saveEntry(context: Context, entryId: String) {
        preferences(context).edit()
            .clear()
            .putString(KEY_TYPE, TYPE_ENTRY)
            .putString(KEY_ENTRY_ID, entryId)
            .apply()
    }

    fun savePreview(
        context: Context,
        address: String,
        buildingName: String,
        unitDetail: String,
        memo: String,
    ) {
        preferences(context).edit()
            .clear()
            .putString(KEY_TYPE, TYPE_PREVIEW)
            .putString(KEY_ADDRESS, address)
            .putString(KEY_BUILDING, buildingName)
            .putString(KEY_UNIT, unitDetail)
            .putString(KEY_MEMO, memo)
            .apply()
    }

    fun load(context: Context): DisplaySession? {
        val preferences = preferences(context)
        return when (preferences.getString(KEY_TYPE, null)) {
            TYPE_ENTRY -> preferences.getString(KEY_ENTRY_ID, null)
                ?.takeIf(String::isNotBlank)
                ?.let(DisplaySession::Entry)

            TYPE_PREVIEW -> DisplaySession.Preview(
                address = preferences.getString(KEY_ADDRESS, "").orEmpty(),
                buildingName = preferences.getString(KEY_BUILDING, "").orEmpty(),
                unitDetail = preferences.getString(KEY_UNIT, "").orEmpty(),
                memo = preferences.getString(KEY_MEMO, "").orEmpty(),
            )

            else -> null
        }
    }

    fun clear(context: Context) {
        preferences(context).edit().clear().apply()
    }

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    private const val PREFERENCES_NAME = "destination_display_session"
    private const val KEY_TYPE = "type"
    private const val KEY_ENTRY_ID = "entry_id"
    private const val KEY_ADDRESS = "address"
    private const val KEY_BUILDING = "building"
    private const val KEY_UNIT = "unit"
    private const val KEY_MEMO = "memo"
    private const val TYPE_ENTRY = "entry"
    private const val TYPE_PREVIEW = "preview"
}
