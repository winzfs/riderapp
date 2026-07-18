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
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.ui.MemoEditorActivity

class DestinationOverlayService : Service() {
    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopOverlay()
                return START_NOT_STICKY
            }

            ACTION_APPLY_SIZE -> {
                val current = OverlaySizeSettings.load(this)
                val size = OverlaySizeSettings.saveNormalized(
                    context = this,
                    widthDp = intent.getIntExtra(EXTRA_WIDTH_DP, current.widthDp),
                    heightDp = intent.getIntExtra(EXTRA_HEIGHT_DP, current.heightDp),
                )
                applyOverlaySize(size)
                if (overlayView == null) stopSelf(startId)
                return START_NOT_STICKY
            }
        }

        if (intent?.action != ACTION_SHOW) return START_NOT_STICKY

        val entryId = intent.getStringExtra(EXTRA_ENTRY_ID).orEmpty()
        val sourceText = intent.getStringExtra(EXTRA_SOURCE_TEXT).orEmpty()
        val sourcePayloadText = intent.getStringExtra(EXTRA_SOURCE_PAYLOAD_TEXT).orEmpty()
        val displayName = intent.getStringExtra(EXTRA_DISPLAY_NAME).orEmpty()
        val roadAddress = intent.getStringExtra(EXTRA_ROAD_ADDRESS).orEmpty()
        val memo = intent.getStringExtra(EXTRA_MEMO).orEmpty()
        val display = DestinationOverlayFormatter.format(
            sourceText = sourceText,
            sourcePayloadText = sourcePayloadText,
            referenceRoadAddress = roadAddress,
            userDisplayName = displayName,
        )

        startAsForeground(entryId, display, memo)
        if (!Settings.canDrawOverlays(this)) {
            stopOverlay()
            return START_NOT_STICKY
        }

        showOrUpdateOverlay(entryId, display, memo)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        removeOverlayView()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAsForeground(
        entryId: String,
        display: DestinationOverlayFormatter.DisplayParts,
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

        val notificationText = listOf(
            display.buildingName,
            display.unitDetail,
            memo,
        ).filter(String::isNotBlank).joinToString(" · ").ifBlank { "눌러서 메모 입력" }

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(display.primaryAddress)
            .setContentText(notificationText)
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "닫기",
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
        display: DestinationOverlayFormatter.DisplayParts,
        memo: String,
    ) {
        removeOverlayView()
        val initialSize = OverlaySizeSettings.load(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(15), dp(11), dp(9), dp(12))
            background = GradientDrawable().apply {
                setColor(Color.argb(240, 27, 31, 39))
                cornerRadius = dp(14).toFloat()
                setStroke(dp(1), Color.argb(110, 255, 255, 255))
            }
            elevation = dp(10).toFloat()
            setOnClickListener { startActivity(openEditorIntent(entryId)) }
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.TOP
        }
        val addressText = TextView(this).apply {
            text = display.primaryAddress
            textSize = 20f
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            maxLines = 3
            setLineSpacing(0f, 1.05f)
        }
        val closeText = TextView(this).apply {
            text = "  ×  "
            textSize = 20f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(220, 225, 232))
            setOnClickListener { stopOverlay() }
        }
        header.addView(
            addressText,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        header.addView(closeText)
        root.addView(header)

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        if (display.buildingName.isNotBlank()) {
            content.addView(
                plainText(
                    value = display.buildingName,
                    size = 15f,
                    color = Color.rgb(222, 229, 239),
                    bold = true,
                    maxLines = 2,
                ),
            )
        }

        if (display.unitDetail.isNotBlank()) {
            content.addView(
                plainText(
                    value = display.unitDetail,
                    size = 19f,
                    color = Color.rgb(255, 220, 142),
                    bold = true,
                    maxLines = 2,
                ),
            )
        }

        content.addView(
            plainText(
                value = memo.ifBlank { "눌러서 메모 입력" },
                size = 12f,
                color = if (memo.isBlank()) {
                    Color.rgb(158, 168, 183)
                } else {
                    Color.rgb(238, 241, 246)
                },
                bold = false,
                maxLines = 5,
            ),
        )

        val scroll = ScrollView(this).apply {
            isFillViewport = false
            addView(
                content,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        root.addView(
            scroll,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ).apply {
                topMargin = dp(2)
            },
        )

        val params = WindowManager.LayoutParams(
            dp(initialSize.widthDp),
            dp(initialSize.heightDp),
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
        overlayParams = params
    }

    private fun applyOverlaySize(size: OverlaySize) {
        val params = overlayParams ?: return
        params.width = dp(size.widthDp)
        params.height = dp(size.heightDp)
        overlayView?.let { view ->
            runCatching { windowManager.updateViewLayout(view, params) }
        }
    }

    private fun plainText(
        value: String,
        size: Float,
        color: Int,
        bold: Boolean,
        maxLines: Int,
    ): TextView = TextView(this).apply {
        text = value
        textSize = size
        this.maxLines = maxLines
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(5), dp(5), 0)
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
        overlayParams = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "목적지 주소·메모 오버레이",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "현재 목적지의 세부주소, 건물명, 동·호수와 메모를 표시합니다."
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
        private const val ACTION_APPLY_SIZE = "com.winzfs.navcapture.action.APPLY_OVERLAY_SIZE"
        private const val EXTRA_ENTRY_ID = "entry_id"
        private const val EXTRA_SOURCE_TEXT = "source_text"
        private const val EXTRA_SOURCE_PAYLOAD_TEXT = "source_payload_text"
        private const val EXTRA_DISPLAY_NAME = "display_name"
        private const val EXTRA_ROAD_ADDRESS = "road_address"
        private const val EXTRA_MEMO = "memo"
        private const val EXTRA_WIDTH_DP = "width_dp"
        private const val EXTRA_HEIGHT_DP = "height_dp"

        fun show(context: Context, entry: AddressMemoEntry) {
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
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

        fun hide(context: Context) {
            context.stopService(Intent(context, DestinationOverlayService::class.java))
        }

        fun currentSize(context: Context): OverlaySize = OverlaySizeSettings.load(context)

        fun adjustSize(
            context: Context,
            widthDeltaDp: Int,
            heightDeltaDp: Int,
        ): OverlaySize {
            val size = OverlaySizeSettings.adjust(context, widthDeltaDp, heightDeltaDp)
            requestSizeApply(context, size)
            return size
        }

        fun resetSize(context: Context): OverlaySize {
            val size = OverlaySizeSettings.reset(context)
            requestSizeApply(context, size)
            return size
        }

        private fun requestSizeApply(context: Context, size: OverlaySize) {
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
                action = ACTION_APPLY_SIZE
                putExtra(EXTRA_WIDTH_DP, size.widthDp)
                putExtra(EXTRA_HEIGHT_DP, size.heightDp)
            }
            runCatching { context.startService(intent) }
        }
    }
}
