package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.model.CapturedDestination
import com.winzfs.navcapture.navigation.NavApp
import com.winzfs.navcapture.navigation.NavigationForwarder
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.parser.NavigationIntentParser
import com.winzfs.navcapture.storage.CaptureStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {
    private val parser = NavigationIntentParser()
    private lateinit var store: CaptureStore
    private lateinit var forwarder: NavigationForwarder
    private val handler = Handler(Looper.getMainLooper())

    private lateinit var statusText: TextView
    private lateinit var detailText: TextView
    private lateinit var historyText: TextView
    private lateinit var autoForwardSwitch: Switch
    private lateinit var overlaySwitch: Switch
    private lateinit var overlayPermissionButton: Button
    private lateinit var navSpinner: Spinner

    private var currentCapture: CapturedDestination? = null
    private var pendingForward: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = CaptureStore(this)
        forwarder = NavigationForwarder(this)
        buildUi()
        renderHistory()
        handleIncomingIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        updateOverlayPermissionUi()
        if (
            ::overlaySwitch.isInitialized &&
            overlaySwitch.isChecked &&
            Settings.canDrawOverlays(this)
        ) {
            currentCapture?.let(::showDestinationOverlay)
        }
    }

    override fun onDestroy() {
        pendingForward?.let(handler::removeCallbacks)
        super.onDestroy()
    }

    private fun buildUi() {
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.rgb(245, 246, 248))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(30))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "라이더 목적지 중계"
            textSize = 25f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(25, 29, 36))
        })
        root.addView(TextView(this).apply {
            text = "배달앱의 목적지를 저장하고 작은 오버레이로 표시한 뒤 원하는 지도 앱으로 연결합니다."
            textSize = 14f
            setTextColor(Color.rgb(80, 86, 96))
            setPadding(0, dp(8), 0, dp(18))
        })

        statusText = cardText("아직 길찾기 호출을 받지 않았습니다.", 16f, true)
        root.addView(statusText)

        root.addView(sectionTitle("목적지 오버레이"))
        overlaySwitch = Switch(this).apply {
            text = "다른 앱 위에 현재 목적지 표시"
            textSize = 16f
            isChecked = settings().getBoolean(KEY_OVERLAY_ENABLED, true)
            setPadding(dp(4), dp(6), dp(4), dp(6))
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_OVERLAY_ENABLED, checked).apply()
                if (checked) {
                    if (Settings.canDrawOverlays(this@MainActivity)) {
                        currentCapture?.let(::showDestinationOverlay)
                    } else {
                        toast("먼저 오버레이 권한을 허용해 주세요.")
                    }
                } else {
                    DestinationOverlayService.hide(this@MainActivity)
                }
            }
        }
        root.addView(overlaySwitch)

        overlayPermissionButton = Button(this).apply {
            isAllCaps = false
            setOnClickListener { openOverlayPermissionSettings() }
        }
        root.addView(overlayPermissionButton, marginParams(bottom = 8))

        root.addView(Button(this).apply {
            text = "현재 오버레이 닫기"
            isAllCaps = false
            setOnClickListener { DestinationOverlayService.hide(this@MainActivity) }
        }, marginParams(bottom = 8))

        root.addView(sectionTitle("지도 앱 연결"))
        autoForwardSwitch = Switch(this).apply {
            text = "목적지를 받으면 바로 지도 앱 선택/실행"
            textSize = 16f
            isChecked = settings().getBoolean(KEY_AUTO_FORWARD, true)
            setPadding(dp(4), dp(6), dp(4), dp(6))
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_AUTO_FORWARD, checked).apply()
                if (!checked) pendingForward?.let(handler::removeCallbacks)
            }
        }
        root.addView(autoForwardSwitch)

        navSpinner = Spinner(this)
        val navApps = NavApp.entries
        navSpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            navApps,
        )
        val savedApp = NavApp.fromStored(settings().getString(KEY_NAV_APP, null))
        navSpinner.setSelection(navApps.indexOf(savedApp).coerceAtLeast(0))
        navSpinner.onItemSelectedListener = SimpleItemSelectedListener { position ->
            settings().edit().putString(KEY_NAV_APP, navApps[position].name).apply()
        }
        root.addView(navSpinner, marginParams(top = 4, bottom = 10))

        root.addView(Button(this).apply {
            text = "현재 목적지를 선택한 지도 앱으로 열기"
            isAllCaps = false
            setOnClickListener { forwardCurrentCapture() }
        }, marginParams(bottom = 8))

        root.addView(Button(this).apply {
            text = "광주 샘플 목적지로 시험"
            isAllCaps = false
            setOnClickListener {
                handleIncomingIntent(
                    Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse(
                            "geo:35.1595454,126.8526012" +
                                "?q=35.1595454,126.8526012(광주광역시청)",
                        ),
                    ),
                    synthetic = true,
                )
            }
        }, marginParams(bottom = 8))

        root.addView(sectionTitle("마지막 수신 내용"))
        detailText = cardText("원본 URI가 들어오면 이곳에 표시됩니다.", 13f, false).apply {
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
        }
        root.addView(detailText)

        root.addView(sectionTitle("최근 기록"))
        historyText = cardText("기록 없음", 13f, false).apply {
            setTextIsSelectable(true)
        }
        root.addView(historyText)

        root.addView(Button(this).apply {
            text = "기록 모두 지우기"
            isAllCaps = false
            setOnClickListener {
                store.clear()
                currentCapture = null
                DestinationOverlayService.hide(this@MainActivity)
                detailText.text = "기록을 지웠습니다."
                statusText.text = "새 길찾기 호출을 기다리는 중"
                renderHistory()
            }
        }, marginParams(top = 12))

        root.addView(TextView(this).apply {
            text = "권장 설정: 지도 앱은 ‘매번 지도앱 선택’으로 두면 RiderApp이 목적지를 받은 뒤 설치된 카카오내비·카카오맵·티맵·네이버지도·구글지도 중에서 다시 선택할 수 있습니다."
            textSize = 13f
            setTextColor(Color.rgb(53, 84, 128))
            setPadding(dp(4), dp(18), dp(4), 0)
        })

        setContentView(scroll)
        updateOverlayPermissionUi()
    }

    private fun handleIncomingIntent(intent: Intent?, synthetic: Boolean = false) {
        if (intent == null) return
        if (!synthetic && intent.action == Intent.ACTION_MAIN && intent.data == null) {
            store.load().firstOrNull()?.let {
                currentCapture = it
                renderCapture(it, "최근 기록")
            }
            return
        }

        val capture = parser.parse(intent)
        currentCapture = capture
        val saved = store.save(capture)
        val origin = if (synthetic) "샘플 파싱 성공" else "길찾기 전달값 수신 성공"
        renderCapture(capture, if (saved) origin else "$origin · 중복 기록 생략")
        renderHistory()
        showDestinationOverlay(capture)

        if (autoForwardSwitch.isChecked) {
            scheduleForward()
        }
    }

    private fun showDestinationOverlay(capture: CapturedDestination) {
        if (!overlaySwitch.isChecked) return
        if (!Settings.canDrawOverlays(this)) {
            statusText.text = "목적지 저장 성공 · 오버레이 권한 필요"
            updateOverlayPermissionUi()
            return
        }

        DestinationOverlayService.show(
            context = this,
            destinationName = capture.destinationName.ifBlank { "배달 목적지" },
            latitude = capture.latitude,
            longitude = capture.longitude,
        )
    }

    private fun scheduleForward() {
        pendingForward?.let(handler::removeCallbacks)
        pendingForward = Runnable { forwardCurrentCapture() }.also {
            handler.postDelayed(it, AUTO_FORWARD_DELAY_MS)
        }
        statusText.text = "수신 성공 · 목적지 표시 후 지도 앱을 엽니다"
    }

    private fun forwardCurrentCapture() {
        val capture = currentCapture ?: store.load().firstOrNull()
        if (capture == null) {
            toast("먼저 길찾기 전달값을 받아야 합니다.")
            return
        }
        val requested = NavApp.entries[navSpinner.selectedItemPosition.coerceAtLeast(0)]
        forwarder.forward(capture, requested)
            .onSuccess { app ->
                statusText.text = if (app == NavApp.PICK_EACH_TIME) {
                    "저장 완료 · 지도 앱을 선택하세요"
                } else {
                    "저장 완료 · ${app.label} 실행"
                }
            }
            .onFailure { error ->
                statusText.text = "지도 앱 실행 실패"
                toast(error.message ?: "지도 앱을 열지 못했습니다.")
            }
    }

    private fun openOverlayPermissionSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName"),
        )
        runCatching { startActivity(intent) }
            .onFailure {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
            }
    }

    private fun updateOverlayPermissionUi() {
        if (!::overlayPermissionButton.isInitialized) return
        overlayPermissionButton.text = if (Settings.canDrawOverlays(this)) {
            "오버레이 권한 허용됨 · 설정 열기"
        } else {
            "오버레이 권한 허용하기"
        }
    }

    private fun renderCapture(capture: CapturedDestination, headline: String) {
        statusText.text = buildString {
            append(headline)
            if (capture.hasCoordinates) append(" · 좌표 확인됨")
            else append(" · 원본 URI만 확인됨")
        }

        detailText.text = buildString {
            appendLine("수신 시각 : ${formatTime(capture.capturedAt)}")
            appendLine("형식      : ${capture.format}")
            appendLine("Action    : ${capture.action.ifBlank { "없음" }}")
            appendLine("Scheme    : ${capture.scheme.ifBlank { "없음" }}")
            appendLine("Host      : ${capture.host.ifBlank { "없음" }}")
            appendLine("Path      : ${capture.path.ifBlank { "없음" }}")
            appendLine("목적지명  : ${capture.destinationName.ifBlank { "확인 안 됨" }}")
            appendLine("위도      : ${capture.latitude ?: "확인 안 됨"}")
            appendLine("경도      : ${capture.longitude ?: "확인 안 됨"}")
            appendLine("Flags     : 0x${capture.flags.toString(16)}")
            appendLine("Categories: ${capture.categories.ifBlank { "없음" }}")
            appendLine()
            appendLine("[원본 URI]")
            appendLine(capture.rawUri.ifBlank { "없음" })
            appendLine()
            appendLine("[Extras]")
            append(capture.extrasText)
        }
    }

    private fun renderHistory() {
        val captures = store.load()
        historyText.text = if (captures.isEmpty()) {
            "기록 없음"
        } else {
            captures.take(10).mapIndexed { index, capture ->
                buildString {
                    append("${index + 1}. ${formatTime(capture.capturedAt)}")
                    append(" · ${capture.scheme.ifBlank { capture.format }}")
                    capture.destinationName.takeIf { it.isNotBlank() }?.let { append(" · $it") }
                    if (capture.hasCoordinates) {
                        append("\n   ${capture.latitude}, ${capture.longitude}")
                    }
                    append("\n   ${capture.rawUri.take(180)}")
                }
            }.joinToString("\n\n")
        }
    }

    private fun sectionTitle(text: String): TextView = TextView(this).apply {
        this.text = text
        textSize = 17f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.rgb(38, 43, 52))
        setPadding(dp(2), dp(22), dp(2), dp(8))
    }

    private fun cardText(text: String, size: Float, bold: Boolean): TextView = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(Color.rgb(35, 39, 47))
        setPadding(dp(16), dp(15), dp(16), dp(15))
        setBackgroundColor(Color.WHITE)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        gravity = Gravity.START
    }

    private fun marginParams(
        top: Int = 0,
        bottom: Int = 0,
    ): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply {
        topMargin = dp(top)
        bottomMargin = dp(bottom)
    }

    private fun settings() = getSharedPreferences(SETTINGS_NAME, MODE_PRIVATE)

    private fun formatTime(timestamp: Long): String =
        SimpleDateFormat("MM-dd HH:mm:ss", Locale.KOREA).format(Date(timestamp))

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val SETTINGS_NAME = "nav_capture_settings"
        private const val KEY_AUTO_FORWARD = "auto_forward"
        private const val KEY_NAV_APP = "nav_app"
        private const val KEY_OVERLAY_ENABLED = "overlay_enabled"
        private const val AUTO_FORWARD_DELAY_MS = 550L
    }
}

private class SimpleItemSelectedListener(
    private val onSelected: (Int) -> Unit,
) : android.widget.AdapterView.OnItemSelectedListener {
    override fun onItemSelected(
        parent: android.widget.AdapterView<*>?,
        view: View?,
        position: Int,
        id: Long,
    ) {
        onSelected(position)
    }

    override fun onNothingSelected(parent: android.widget.AdapterView<*>?) = Unit
}
