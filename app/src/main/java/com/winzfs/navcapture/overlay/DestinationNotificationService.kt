package com.winzfs.navcapture.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.ui.MemoEditorActivity
import com.winzfs.navcapture.ui.OverlayPreviewActivity

/**
 * Shows destination information through Android SystemUI only.
 *
 * The status bar contains the notification icon. Address details live in the notification shade,
 * and an optional high-importance heads-up notification briefly appears for a new destination.
 */
class DestinationNotificationService : Service() {
    private var activePayload: Payload? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopNotifications()
                return START_NOT_STICKY
            }
            ACTION_REFRESH -> {
                activePayload?.let { updateNotifications(it, showHeadsUp = false) }
                if (activePayload == null) stopSelf(startId)
                return START_NOT_STICKY
            }
            ACTION_SHOW -> {
                val payload = Payload(
                    entryId = intent.getStringExtra(EXTRA_ENTRY_ID).orEmpty(),
                    sourceText = intent.getStringExtra(EXTRA_SOURCE_TEXT).orEmpty(),
                    sourcePayloadText = intent.getStringExtra(EXTRA_SOURCE_PAYLOAD_TEXT).orEmpty(),
                    displayName = intent.getStringExtra(EXTRA_DISPLAY_NAME).orEmpty(),
                    roadAddress = intent.getStringExtra(EXTRA_ROAD_ADDRESS).orEmpty(),
                    memo = intent.getStringExtra(EXTRA_MEMO).orEmpty(),
                    previewMode = intent.getBooleanExtra(EXTRA_PREVIEW_MODE, false),
                )
                activePayload = payload
                updateNotifications(payload, showHeadsUp = true)
                return START_STICKY
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        getSystemService(NotificationManager::class.java).cancel(HEADS_UP_NOTIFICATION_ID)
        activePayload = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun updateNotifications(payload: Payload, showHeadsUp: Boolean) {
        val display = DestinationOverlayFormatter.format(
            sourceText = payload.sourceText,
            sourcePayloadText = payload.sourcePayloadText,
            referenceRoadAddress = payload.roadAddress,
            userDisplayName = payload.displayName,
        )
        val presentation = OverlayPresentationSettings.load(this)
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            if (payload.previewMode) {
                Intent(this, OverlayPreviewActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
            } else {
                MemoEditorActivity.intent(this, payload.entryId, true).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP,
                    )
                }
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, DestinationNotificationService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val title = display.primaryAddress.ifBlank {
            display.buildingName.ifBlank { "배달 목적지" }
        }
        val summary = listOf(display.buildingName, display.unitDetail, payload.memo)
            .filter(String::isNotBlank)
            .joinToString(" · ")
            .ifBlank { "목적지 상세정보 없음" }
        val detail = buildList {
            display.primaryAddress.takeIf(String::isNotBlank)?.let { add("주소  $it") }
            display.buildingName.takeIf(String::isNotBlank)?.let { add("건물  $it") }
            display.unitDetail.takeIf(String::isNotBlank)?.let { add("동·호수  $it") }
            payload.memo.takeIf(String::isNotBlank)?.let { add("메모  $it") }
        }.joinToString("\n")

        val ongoingBuilder = Notification.Builder(this, ONGOING_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(title)
            .setContentText(summary)
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setSubText(if (payload.previewMode) "RiderApp 샘플" else "RiderApp 현재 목적지")
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "닫기",
                    stopPendingIntent,
                ).build(),
            )

        if (presentation.showDetailedNotification) {
            ongoingBuilder.setStyle(
                Notification.BigTextStyle()
                    .setBigContentTitle(title)
                    .bigText(detail.ifBlank { summary }),
            )
        }

        val ongoingNotification = ongoingBuilder.build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                ONGOING_NOTIFICATION_ID,
                ongoingNotification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(ONGOING_NOTIFICATION_ID, ongoingNotification)
        }

        if (showHeadsUp && presentation.showHeadsUpNotification) {
            val headsUp = Notification.Builder(this, HEADS_UP_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle(title)
                .setContentText(summary)
                .setStyle(Notification.BigTextStyle().bigText(detail.ifBlank { summary }))
                .setContentIntent(openPendingIntent)
                .setAutoCancel(true)
                .setTimeoutAfter(7_000L)
                .setCategory(Notification.CATEGORY_NAVIGATION)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build()
            getSystemService(NotificationManager::class.java).notify(
                HEADS_UP_NOTIFICATION_ID,
                headsUp,
            )
        }
    }

    private fun stopNotifications() {
        getSystemService(NotificationManager::class.java).cancel(HEADS_UP_NOTIFICATION_ID)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                ONGOING_CHANNEL_ID,
                "현재 목적지",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "상태표시줄 아이콘과 알림 패널에 현재 목적지를 계속 표시합니다."
                setShowBadge(false)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                HEADS_UP_CHANNEL_ID,
                "새 목적지 상단 알림",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "새 목적지를 받았을 때 화면 상단에 시스템 알림 배너를 잠시 표시합니다."
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            },
        )
    }

    private data class Payload(
        val entryId: String,
        val sourceText: String,
        val sourcePayloadText: String,
        val displayName: String,
        val roadAddress: String,
        val memo: String,
        val previewMode: Boolean,
    )

    companion object {
        private const val ONGOING_CHANNEL_ID = "destination_system_notification"
        private const val HEADS_UP_CHANNEL_ID = "destination_heads_up_v1"
        private const val ONGOING_NOTIFICATION_ID = 3201
        private const val HEADS_UP_NOTIFICATION_ID = 3202

        private const val ACTION_SHOW = "com.winzfs.navcapture.action.SHOW_SYSTEM_NOTIFICATION"
        private const val ACTION_STOP = "com.winzfs.navcapture.action.STOP_SYSTEM_NOTIFICATION"
        private const val ACTION_REFRESH = "com.winzfs.navcapture.action.REFRESH_SYSTEM_NOTIFICATION"
        private const val EXTRA_ENTRY_ID = "entry_id"
        private const val EXTRA_SOURCE_TEXT = "source_text"
        private const val EXTRA_SOURCE_PAYLOAD_TEXT = "source_payload_text"
        private const val EXTRA_DISPLAY_NAME = "display_name"
        private const val EXTRA_ROAD_ADDRESS = "road_address"
        private const val EXTRA_MEMO = "memo"
        private const val EXTRA_PREVIEW_MODE = "preview_mode"

        fun show(context: Context, entry: AddressMemoEntry) {
            val intent = Intent(context, DestinationNotificationService::class.java).apply {
                action = ACTION_SHOW
                putExtra(EXTRA_ENTRY_ID, entry.id)
                putExtra(EXTRA_SOURCE_TEXT, entry.sourceText)
                putExtra(EXTRA_SOURCE_PAYLOAD_TEXT, entry.sourcePayloadText)
                putExtra(EXTRA_DISPLAY_NAME, entry.placeName)
                putExtra(EXTRA_ROAD_ADDRESS, entry.roadAddress)
                putExtra(EXTRA_MEMO, entry.memo)
            }
            context.startForegroundService(intent)
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
            val intent = Intent(context, DestinationNotificationService::class.java).apply {
                action = ACTION_SHOW
                putExtra(EXTRA_ENTRY_ID, PREVIEW_ENTRY_ID)
                putExtra(EXTRA_SOURCE_TEXT, sourceText)
                putExtra(EXTRA_SOURCE_PAYLOAD_TEXT, sourcePayload)
                putExtra(EXTRA_DISPLAY_NAME, buildingName.trim())
                putExtra(EXTRA_ROAD_ADDRESS, address.trim())
                putExtra(EXTRA_MEMO, memo.trim())
                putExtra(EXTRA_PREVIEW_MODE, true)
            }
            context.startForegroundService(intent)
        }

        fun refresh(context: Context) {
            runCatching {
                context.startService(
                    Intent(context, DestinationNotificationService::class.java)
                        .setAction(ACTION_REFRESH),
                )
            }
        }

        fun hide(context: Context) {
            context.stopService(Intent(context, DestinationNotificationService::class.java))
        }

        private const val PREVIEW_ENTRY_ID = "notification-preview"
    }
}
