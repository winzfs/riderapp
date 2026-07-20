package com.winzfs.navcapture.overlay

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.ui.MemoEditorActivity
import com.winzfs.navcapture.ui.OverlayPreviewActivity

class DestinationOverlayService : Service() {
    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private var tickerAnimator: ObjectAnimator? = null

    private var activeEntryId: String = ""
    private var activeDisplay: DestinationOverlayFormatter.DisplayParts? = null
    private var activeMemo: String = ""
    private var activePreviewMode: Boolean = false
    private var currentPresentationMode: OverlayPresentationMode = OverlayPresentationMode.CARD
    private var lastCardX: Int? = null
    private var lastCardY: Int? = null

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

            ACTION_APPLY_STYLE -> {
                refreshCurrentOverlay()
                if (overlayView == null) stopSelf(startId)
                return START_NOT_STICKY
            }

            ACTION_APPLY_PRESENTATION -> {
                refreshCurrentPresentation()
                if (activeDisplay == null) stopSelf(startId)
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
        val previewMode = intent.getBooleanExtra(EXTRA_PREVIEW_MODE, false)
        val display = DestinationOverlayFormatter.format(
            sourceText = sourceText,
            sourcePayloadText = sourcePayloadText,
            referenceRoadAddress = roadAddress,
            userDisplayName = displayName,
        )

        activeEntryId = entryId
        activeDisplay = display
        activeMemo = memo
        activePreviewMode = previewMode

        startAsForeground(entryId, display, memo, previewMode)
        if (!Settings.canDrawOverlays(this)) {
            stopOverlay()
            return START_NOT_STICKY
        }
        showOrUpdateOverlay(entryId, display, memo, previewMode)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        removeOverlayView(clearActive = true)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAsForeground(
        entryId: String,
        display: DestinationOverlayFormatter.DisplayParts,
        memo: String,
        previewMode: Boolean,
    ) {
        val openIntent = if (previewMode) {
            Intent(this, OverlayPreviewActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        } else {
            openEditorIntent(entryId)
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, DestinationOverlayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val presentation = OverlayPresentationSettings.load(this)
        val summaryText = listOf(display.buildingName, display.unitDetail, memo)
            .filter(String::isNotBlank)
            .joinToString(" · ")
            .ifBlank { "목적지 상세정보 없음" }
        val detailedText = listOf(
            display.primaryAddress,
            display.buildingName,
            display.unitDetail,
            memo,
        ).filter(String::isNotBlank).joinToString("\n")

        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setSubText(if (previewMode) "샘플 오버레이" else "현재 배달 목적지")
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "닫기",
                    stopPendingIntent,
                ).build(),
            )

        if (presentation.showDetailedNotification) {
            builder
                .setContentTitle(display.primaryAddress)
                .setContentText(summaryText)
                .setStyle(
                    Notification.BigTextStyle()
                        .setBigContentTitle(display.primaryAddress)
                        .bigText(detailedText.ifBlank { summaryText }),
                )
        } else {
            builder
                .setContentTitle("목적지 오버레이 실행 중")
                .setContentText("눌러서 현재 목적지 열기")
        }

        val notification = builder.build()
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
        previewMode: Boolean,
    ) {
        val presentation = OverlayPresentationSettings.load(this)
        val style = OverlayStyleSettings.load(this)
        removeOverlayView(clearActive = false)
        currentPresentationMode = presentation.mode

        when (presentation.mode) {
            OverlayPresentationMode.CARD -> showCardOverlay(
                entryId = entryId,
                display = display,
                memo = memo,
                previewMode = previewMode,
                style = style,
            )

            OverlayPresentationMode.TOP_TICKER -> showTopTickerOverlay(
                entryId = entryId,
                display = display,
                memo = memo,
                previewMode = previewMode,
                style = style,
            )
        }
    }

    private fun showCardOverlay(
        entryId: String,
        display: DestinationOverlayFormatter.DisplayParts,
        memo: String,
        previewMode: Boolean,
        style: OverlayStyle,
    ) {
        val size = OverlaySizeSettings.load(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(8), dp(7), dp(9))
            background = overlayBackground(style, cornerRadiusDp = 12)
            elevation = if (style.backgroundOpacityPercent == 0) 0f else dp(9).toFloat()
            if (!previewMode) setOnClickListener { startActivity(openEditorIntent(entryId)) }
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.TOP
        }
        val addressText = outlinedText(
            value = display.primaryAddress,
            sizeSp = style.addressTextSizeSp,
            fillRgb = style.primaryTextColor,
            bold = true,
            maxLines = 3,
            style = style,
        )
        val closeText = closeButton(style, style.addressTextSizeSp)
        header.addView(
            addressText,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        header.addView(closeText)
        root.addView(header)

        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (display.buildingName.isNotBlank()) {
            content.addView(
                outlinedText(
                    value = display.buildingName,
                    sizeSp = style.buildingTextSizeSp,
                    fillRgb = style.secondaryTextColor,
                    bold = true,
                    maxLines = 2,
                    style = style,
                ),
            )
        }
        if (display.unitDetail.isNotBlank()) {
            content.addView(
                outlinedText(
                    value = display.unitDetail,
                    sizeSp = style.unitTextSizeSp,
                    fillRgb = style.accentTextColor,
                    bold = true,
                    maxLines = 2,
                    style = style,
                ),
            )
        }
        content.addView(
            outlinedText(
                value = memo.ifBlank { "눌러서 메모 입력" },
                sizeSp = style.memoTextSizeSp,
                fillRgb = style.secondaryTextColor,
                bold = false,
                maxLines = 5,
                style = style,
                muted = memo.isBlank(),
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
            ).apply { topMargin = dp(1) },
        )

        val params = WindowManager.LayoutParams(
            dp(size.widthDp),
            dp(size.heightDp),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = lastCardX ?: dp(10)
            y = lastCardY ?: dp(92)
        }

        installDragHandler(header, params)
        windowManager.addView(root, params)
        overlayView = root
        overlayParams = params
    }

    private fun showTopTickerOverlay(
        entryId: String,
        display: DestinationOverlayFormatter.DisplayParts,
        memo: String,
        previewMode: Boolean,
        style: OverlayStyle,
    ) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(9), dp(3), dp(4), dp(3))
            background = overlayBackground(style, cornerRadiusDp = 10)
            elevation = if (style.backgroundOpacityPercent == 0) 0f else dp(8).toFloat()
        }
        val viewport = FrameLayout(this).apply {
            clipChildren = true
            clipToPadding = true
            if (!previewMode) setOnClickListener { startActivity(openEditorIntent(entryId)) }
        }
        val track = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val tickerContent = listOf(
            display.primaryAddress,
            display.buildingName,
            display.unitDetail,
            memo,
        ).filter(String::isNotBlank)
            .joinToString("   •   ")
            .ifBlank { "목적지 정보 없음" }
        val tickerTextSize = style.addressTextSizeSp.coerceIn(12, 24)
        val firstText = tickerText(tickerContent, tickerTextSize, style)
        val secondText = tickerText(tickerContent, tickerTextSize, style)
        track.addView(firstText)
        track.addView(secondText)
        viewport.addView(
            track,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER_VERTICAL },
        )
        root.addView(
            viewport,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f),
        )
        root.addView(closeButton(style, tickerTextSize))

        val tickerHeightDp = (tickerTextSize + 24).coerceIn(42, 64)
        val params = WindowManager.LayoutParams(
            resources.displayMetrics.widthPixels - dp(12),
            dp(tickerHeightDp),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            x = 0
            y = statusBarHeightPx() + dp(4)
        }

        windowManager.addView(root, params)
        overlayView = root
        overlayParams = params
        root.post { startTickerAnimation(viewport, track, firstText) }
    }

    private fun tickerText(
        value: String,
        sizeSp: Int,
        style: OverlayStyle,
    ): OutlinedTextView = outlinedText(
        value = value,
        sizeSp = sizeSp,
        fillRgb = style.primaryTextColor,
        bold = true,
        maxLines = 1,
        style = style,
        topSpacingDp = 0,
        endSpacingDp = 42,
    ).apply {
        setSingleLine(true)
    }

    private fun startTickerAnimation(
        viewport: FrameLayout,
        track: LinearLayout,
        firstText: View,
    ) {
        tickerAnimator?.cancel()
        val repeatDistance = firstText.width.toFloat()
        if (repeatDistance <= 0f) return
        if (repeatDistance <= viewport.width.toFloat()) {
            track.translationX = 0f
            return
        }
        val distanceDp = repeatDistance / resources.displayMetrics.density
        tickerAnimator = ObjectAnimator.ofFloat(track, View.TRANSLATION_X, 0f, -repeatDistance).apply {
            duration = ((distanceDp / TICKER_SPEED_DP_PER_SECOND) * 1000L)
                .toLong()
                .coerceAtLeast(4_000L)
            interpolator = LinearInterpolator()
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            start()
        }
    }

    private fun outlinedText(
        value: String,
        sizeSp: Int,
        fillRgb: Int,
        bold: Boolean,
        maxLines: Int,
        style: OverlayStyle,
        muted: Boolean = false,
        topSpacingDp: Int = 3,
        endSpacingDp: Int = 4,
    ): OutlinedTextView {
        val fillOpacity = if (muted) {
            (style.textOpacityPercent * 62) / 100
        } else {
            style.textOpacityPercent
        }
        val outlineOpacity = (style.textOutlineOpacityPercent * style.textOpacityPercent) / 100
        return OutlinedTextView(this).apply {
            configure(
                value = value,
                sizeSp = sizeSp,
                fillColor = OverlayStyleSettings.argb(fillRgb, fillOpacity),
                outlineColor = OverlayStyleSettings.argb(style.textOutlineColor, outlineOpacity),
                outlineWidthDp = style.textOutlineWidthDp,
                bold = bold,
                maxLines = maxLines,
                topSpacingDp = topSpacingDp,
                endSpacingDp = endSpacingDp,
            )
        }
    }

    private fun closeButton(style: OverlayStyle, referenceTextSizeSp: Int): TextView =
        TextView(this).apply {
            text = " × "
            textSize = referenceTextSizeSp.coerceIn(16, 22).toFloat()
            gravity = Gravity.CENTER
            setTextColor(
                OverlayStyleSettings.muted(
                    style.secondaryTextColor,
                    style.textOpacityPercent,
                ),
            )
            setOnClickListener { stopOverlay() }
        }

    private fun overlayBackground(style: OverlayStyle, cornerRadiusDp: Int): GradientDrawable =
        GradientDrawable().apply {
            setColor(
                OverlayStyleSettings.argb(
                    style.backgroundColor,
                    style.backgroundOpacityPercent,
                ),
            )
            cornerRadius = dp(cornerRadiusDp).toFloat()
        }

    private fun refreshCurrentOverlay() {
        val display = activeDisplay ?: return
        showOrUpdateOverlay(
            entryId = activeEntryId,
            display = display,
            memo = activeMemo,
            previewMode = activePreviewMode,
        )
    }

    private fun refreshCurrentPresentation() {
        val display = activeDisplay ?: return
        startAsForeground(
            entryId = activeEntryId,
            display = display,
            memo = activeMemo,
            previewMode = activePreviewMode,
        )
        if (Settings.canDrawOverlays(this)) {
            showOrUpdateOverlay(
                entryId = activeEntryId,
                display = display,
                memo = activeMemo,
                previewMode = activePreviewMode,
            )
        }
    }

    private fun applyOverlaySize(size: OverlaySize) {
        if (currentPresentationMode != OverlayPresentationMode.CARD) return
        val params = overlayParams ?: return
        params.width = dp(size.widthDp)
        params.height = dp(size.heightDp)
        overlayView?.let { view -> runCatching { windowManager.updateViewLayout(view, params) } }
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
        removeOverlayView(clearActive = true)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun removeOverlayView(clearActive: Boolean) {
        if (currentPresentationMode == OverlayPresentationMode.CARD) {
            overlayParams?.let { params ->
                lastCardX = params.x
                lastCardY = params.y
            }
        }
        tickerAnimator?.cancel()
        tickerAnimator = null
        overlayView?.let { view -> runCatching { windowManager.removeView(view) } }
        overlayView = null
        overlayParams = null
        if (clearActive) {
            activeEntryId = ""
            activeDisplay = null
            activeMemo = ""
            activePreviewMode = false
        }
    }

    private fun statusBarHeightPx(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "목적지 주소·메모 오버레이",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "현재 목적지의 주소, 건물명, 동·호수와 메모를 표시합니다."
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
        private const val ACTION_APPLY_STYLE = "com.winzfs.navcapture.action.APPLY_OVERLAY_STYLE"
        private const val ACTION_APPLY_PRESENTATION = "com.winzfs.navcapture.action.APPLY_OVERLAY_PRESENTATION"
        private const val EXTRA_ENTRY_ID = "entry_id"
        private const val EXTRA_SOURCE_TEXT = "source_text"
        private const val EXTRA_SOURCE_PAYLOAD_TEXT = "source_payload_text"
        private const val EXTRA_DISPLAY_NAME = "display_name"
        private const val EXTRA_ROAD_ADDRESS = "road_address"
        private const val EXTRA_MEMO = "memo"
        private const val EXTRA_WIDTH_DP = "width_dp"
        private const val EXTRA_HEIGHT_DP = "height_dp"
        private const val EXTRA_PREVIEW_MODE = "preview_mode"
        private const val TICKER_SPEED_DP_PER_SECOND = 42f

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
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
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

        fun hide(context: Context) {
            context.stopService(Intent(context, DestinationOverlayService::class.java))
        }

        fun currentSize(context: Context): OverlaySize = OverlaySizeSettings.load(context)

        fun adjustSize(context: Context, widthDeltaDp: Int, heightDeltaDp: Int): OverlaySize {
            val size = OverlaySizeSettings.adjust(context, widthDeltaDp, heightDeltaDp)
            requestSizeApply(context, size)
            return size
        }

        fun resetSize(context: Context): OverlaySize {
            val size = OverlaySizeSettings.reset(context)
            requestSizeApply(context, size)
            return size
        }

        fun refreshStyle(context: Context) {
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
                action = ACTION_APPLY_STYLE
            }
            runCatching { context.startService(intent) }
        }

        fun refreshPresentation(context: Context) {
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
                action = ACTION_APPLY_PRESENTATION
            }
            runCatching { context.startService(intent) }
        }

        private fun requestSizeApply(context: Context, size: OverlaySize) {
            val intent = Intent(context, DestinationOverlayService::class.java).apply {
                action = ACTION_APPLY_SIZE
                putExtra(EXTRA_WIDTH_DP, size.widthDp)
                putExtra(EXTRA_HEIGHT_DP, size.heightDp)
            }
            runCatching { context.startService(intent) }
        }

        private const val PREVIEW_ENTRY_ID = "overlay-preview"
    }
}
