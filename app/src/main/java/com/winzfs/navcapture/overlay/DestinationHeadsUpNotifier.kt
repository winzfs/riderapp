package com.winzfs.navcapture.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.ui.MemoEditorActivity
import com.winzfs.navcapture.ui.OverlayPreviewActivity

/** Brief Android SystemUI banner shown when a genuinely new destination payload arrives. */
object DestinationHeadsUpNotifier {
    fun showEntry(context: Context, entry: AddressMemoEntry) {
        val display = DestinationOverlayFormatter.format(
            sourceText = entry.sourceText,
            sourcePayloadText = entry.sourcePayloadText,
            referenceRoadAddress = entry.roadAddress,
            userDisplayName = entry.placeName,
        )
        show(
            context = context,
            display = display,
            memo = entry.memo,
            fingerprint = listOf(
                entry.id,
                entry.sourceText,
                entry.sourcePayloadText,
                entry.memo,
            ).joinToString("|"),
            openIntent = MemoEditorActivity.intent(context, entry.id, true),
        )
    }

    fun showPreview(
        context: Context,
        address: String,
        buildingName: String,
        unitDetail: String,
        memo: String,
    ) {
        val sourceText = listOf(address, buildingName, unitDetail)
            .map(String::trim)
            .filter(String::isNotBlank)
            .joinToString(" ")
        val sourcePayload = buildString {
            appendLine("address=${address.trim()}")
            appendLine("buildingName=${buildingName.trim()}")
            append("unitDetail=${unitDetail.trim()}")
        }
        val display = DestinationOverlayFormatter.format(
            sourceText = sourceText,
            sourcePayloadText = sourcePayload,
            referenceRoadAddress = address.trim(),
            userDisplayName = buildingName.trim(),
        )
        show(
            context = context,
            display = display,
            memo = memo,
            fingerprint = listOf(address, buildingName, unitDetail, memo).joinToString("|"),
            openIntent = Intent(context, OverlayPreviewActivity::class.java),
        )
    }

    fun cancel(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    }

    private fun show(
        context: Context,
        display: DestinationOverlayFormatter.DisplayParts,
        memo: String,
        fingerprint: String,
        openIntent: Intent,
    ) {
        if (!OverlayPresentationSettings.load(context).showHeadsUpNotification) return
        if (isRecentDuplicate(context, fingerprint)) return

        val manager = context.getSystemService(NotificationManager::class.java)
        createChannel(manager)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = display.unitDetail.ifBlank {
            display.buildingName.ifBlank { display.primaryAddress.ifBlank { "새 배달 목적지" } }
        }
        val summary = listOf(
            display.primaryAddress.takeUnless { it == title }.orEmpty(),
            display.buildingName.takeUnless { it == title }.orEmpty(),
            memo,
        ).filter(String::isNotBlank).joinToString(" · ").ifBlank { "새 목적지를 받았습니다." }
        val detail = buildString {
            display.primaryAddress.takeIf(String::isNotBlank)?.let { appendLine("주소  $it") }
            display.buildingName.takeIf(String::isNotBlank)?.let { appendLine("건물  $it") }
            display.unitDetail.takeIf(String::isNotBlank)?.let { appendLine("동·호수  $it") }
            memo.takeIf(String::isNotBlank)?.let { appendLine("메모  $it") }
        }.trim().ifBlank { summary }

        val notification = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(Notification.BigTextStyle().bigText(detail))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setTimeoutAfter(7_000L)
            .setCategory(Notification.CATEGORY_NAVIGATION)
            .setPriority(Notification.PRIORITY_HIGH)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build()
        manager.notify(NOTIFICATION_ID, notification)
        remember(context, fingerprint)
    }

    private fun createChannel(manager: NotificationManager) {
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "새 목적지 상단 알림",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "새 배달 목적지를 받으면 안드로이드 시스템 상단 배너를 잠시 표시합니다."
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            },
        )
    }

    private fun isRecentDuplicate(context: Context, fingerprint: String): Boolean {
        val preferences = preferences(context)
        return preferences.getString(KEY_FINGERPRINT, null) == fingerprint &&
            System.currentTimeMillis() - preferences.getLong(KEY_SHOWN_AT, 0L) < DEDUP_WINDOW_MS
    }

    private fun remember(context: Context, fingerprint: String) {
        preferences(context).edit()
            .putString(KEY_FINGERPRINT, fingerprint)
            .putLong(KEY_SHOWN_AT, System.currentTimeMillis())
            .apply()
    }

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    private const val CHANNEL_ID = "destination_heads_up_v2"
    private const val NOTIFICATION_ID = 3202
    private const val PREFERENCES_NAME = "destination_heads_up_state"
    private const val KEY_FINGERPRINT = "fingerprint"
    private const val KEY_SHOWN_AT = "shown_at"
    private const val DEDUP_WINDOW_MS = 20_000L
}
