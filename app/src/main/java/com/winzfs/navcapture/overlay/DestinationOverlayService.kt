package com.winzfs.navcapture.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.ui.MemoEditorActivity

class DestinationOverlayService : Service() {
    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopOverlay()
            return START_NOT_STICKY
        }

        val entryId = intent?.getStringExtra(EXTRA_ENTRY_ID).orEmpty()
        val sourceText = intent?.getStringExtra(EXTRA_SOURCE_TEXT).orEmpty()
        val displayName = intent?.getStringExtra(EXTRA_DISPLAY_NAME).orEmpty()
        val roadAddress = intent?.getStringExtra(EXTRA_ROAD_ADDRESS).orEmpty()
        val memo = intent?.getStringExtra(EXTRA_MEMO).orEmpty()
        val title = sourceText.ifBlank { displayName.ifBlank { "배달 목적지" } }

        startAsForeground(entryId, title, roadAddress, memo)
        if (!Settings.canDrawOverlays(this)) {
            stopOverlay()
            return START_NOT_STICKY
        }

        showOrUpdateOverlay(entryId, title, displayName, roadAddress, memo)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        removeOverlayView()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAsForeground(
        entryId: String,
        sourceTitle: String,
        roadAddress: String,
        memo: String,
    ) {
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openEditorIntent(entryId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, DestinationOverlayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("현재 배달 목적지 · $sourceTitle")
            .setContentText(roadAddress.ifBlank { memo.ifBlank { "참고 주소·메모 없음" } })
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "오버레이 닫기",
                    stopPendingIntent,
                ).build(),
            )
            .build()

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun showOrUpdateOverlay(
        entryId: String,
        sourceTitle: String,
        displayName: String,
        roadAddress: String,
        memo: String,
    ) {
        removeOverlayView()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(13), dp(9), dp(9), dp(10))
            background = GradientDrawable().apply {
                setColor(Color.argb(238, 30, 34, 42))
                cornerRadius = dp(14).toFloat()
                setStroke(dp(1), Color.argb(110, 255, 255, 255))
            }
            elevation = dp(10).toFloat()
            setOnClickListener { startActivity(openEditorIntent(entryId)) }
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val nameText = TextView(this).apply {
            text = sourceTitle
            textSize = 14f
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            maxLines = 3
        }
        val closeText = TextView(this).apply {
            text = "  ×  "
            textSize = 20f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(220, 225, 232))
            setOnClickListener { stopOverlay() }
        }
        header.addView(
            nameText,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        header.addView(closeText)
        root.addView(header)

        if (displayName.isNotBlank() && displayName != sourceTitle) {
            root.addView(infoText("내 이름 · $displayName", Color.rgb(205, 213, 225)))
        }
        if (roadAddress.isNotBlank() && roadAddress != sourceTitle) {
            root.addView(infoText("참고 도로명 · $roadAddress", Color.rgb(220, 228, 239)))
        }

        root.addView(
            infoText(
                if (memo.isBlank()) "메모 없음 · 눌러서 입력" else "메모 · $memo",
                if (memo.isBlank()) Color.rgb(165, 174, 188) else Color.rgb(238, 241, 246),
                maxLines = 3,
            ),
        )

        val params = WindowManager.LayoutParams(
            dp(300),
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(10)
            y = dp(92)
        }

        installDragHandler(header, params)
        windowManager.addView(root, params)
        overlayView = root
    }

    private fun infoText(
        value: String,
        color: Int,
        maxLines: Int = 2,
    ): TextView = TextView(this).apply {
        text = value
        textSize = 11.5f
        this.maxLines = maxLines
        setTextColor(color)
        setPadding(0, dp(3), dp(5), 0)
    }

    private fun openEditorIntent(entryId: String): Intent =
        MemoEditorActivity.intent(this, entryId, true).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP,
            )
        }

    private fun installDragHandler(handle: View, params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        handle.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    params.x = (initialX - dx).coerceAtLeast(0)
                    params.y = (initialY + dy).coerceAtLeast(0)
                    overlayView?.let { windowManager.updateViewLayout(it, params) }
                    true
                }
                else -> false
            }
        }
    }

    private fun stopOverlay() {
        removeOverlayView()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun removeOverlayView() {
        overlayView?.let { view -> runCatching { windowManager.removeView(view) } }
        overlayView = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "목적지 원문·메모 오버레이",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "배달앱 목적지 원문과 별도 참고 주소·메모를 표시합니다."
                setShowBadge(false)
            },
        )
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val CHANNEL_ID = "destination_overlay"
        private const val NOTIFICATION_ID = 3101
        private const val ACTION_SHOW = "com.winzfs.navcapture.action.SHOW_OVERLAY"
        private const val ACTION_STOP = "com.winzfs.navcapture.action.STOP_OVERLAY"
        private const val EXTRA_ENTRY_ID = "entry_id"
        private const val EXTRA_SOURCE_TEXT = "source_text"
        private const val EXTRA_DISPLAY_NAME = "display_name"
        private const val EXTRA_ROAD_ADDRESS = "road_address"
        private const val EXTRA_MEMO = "memo"

        fun show(context: Context, entry: AddressMemoEntry) {
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
                action = ACTION_SHOW
                putExtra(EXTRA_ENTRY_ID, entry.id)
                putExtra(EXTRA_SOURCE_TEXT, entry.sourceText)
                putExtra(EXTRA_DISPLAY_NAME, entry.placeName)
                putExtra(EXTRA_ROAD_ADDRESS, entry.roadAddress)
                putExtra(EXTRA_MEMO, entry.memo)
            }
            context.startForegroundService(intent)
        }

        fun hide(context: Context) {
            context.stopService(Intent(context, DestinationOverlayService::class.java))
        }
    }
}
