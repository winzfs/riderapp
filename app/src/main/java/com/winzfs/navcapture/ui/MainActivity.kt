package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Context
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
import com.winzfs.navcapture.address.RoadAddressResolver
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.model.CapturedDestination
import com.winzfs.navcapture.navigation.NavApp
import com.winzfs.navcapture.navigation.NavigationForwarder
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.overlay.OverlaySize
import com.winzfs.navcapture.overlay.OverlaySizePolicy
import com.winzfs.navcapture.parser.NavigationIntentParser
import com.winzfs.navcapture.storage.AddressMemoStore
import com.winzfs.navcapture.storage.CaptureStore
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {
    private val parser = NavigationIntentParser()
    private lateinit var captureStore: CaptureStore
    private lateinit var addressMemoStore: AddressMemoStore
    private lateinit var forwarder: NavigationForwarder
    private lateinit var addressResolver: RoadAddressResolver
    private val handler = Handler(Looper.getMainLooper())

    private lateinit var statusText: TextView
    private lateinit var detailText: TextView
    private lateinit var historyText: TextView
    private lateinit var overlaySizeText: TextView
    private lateinit var autoForwardSwitch: Switch
    private lateinit var overlaySwitch: Switch
    private lateinit var overlayPermissionButton: Button
    private lateinit var editMemoButton: Button
    private lateinit var navSpinner: Spinner

    private var currentCapture: CapturedDestination? = null
    private var currentEntry: AddressMemoEntry? = null
    private var pendingForward: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        captureStore = CaptureStore(this)
        addressMemoStore = AddressMemoStore(this)
        forwarder = NavigationForwarder(this)
        addressResolver = RoadAddressResolver(this)
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
        if (::overlaySizeText.isInitialized) updateOverlaySizeText()
        currentEntry?.let { oldEntry ->
            addressMemoStore.findById(oldEntry.id)?.let { refreshed ->
                currentEntry = refreshed
                renderCurrentDestination("현재 목적지")
                if (overlaySwitch.isChecked && Settings.canDrawOverlays(this)) {
                    DestinationOverlayService.show(this, refreshed)
                }
            }
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
            text = "배달앱 목적지 원문과 좌표를 그대로 보존해 지도 앱으로 전달하고, 참고 주소와 개인 메모는 별도로 표시합니다."
            textSize = 14f
            setTextColor(Color.rgb(80, 86, 96))
            setPadding(0, dp(8), 0, dp(18))
        })

        statusText = cardText("아직 길찾기 호출을 받지 않았습니다.", 16f, true)
        root.addView(statusText)

        root.addView(sectionTitle("목적지 오버레이"))
        overlaySwitch = Switch(this).apply {
            text = "다른 앱 위에 원문·참고 주소·메모 표시"
            textSize = 16f
            isChecked = settings().getBoolean(KEY_OVERLAY_ENABLED, true)
            setPadding(dp(4), dp(6), dp(4), dp(6))
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_OVERLAY_ENABLED, checked).apply()
                if (checked) {
                    if (Settings.canDrawOverlays(this@MainActivity)) {
                        currentEntry?.let { DestinationOverlayService.show(this@MainActivity, it) }
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

        root.addView(sectionTitle("오버레이 크기 설정"))
        overlaySizeText = cardText("", 14f, true)
        updateOverlaySizeText()
        root.addView(overlaySizeText)
        root.addView(
            pairedButtons(
                leftLabel = "가로 줄이기",
                leftAction = {
                    adjustOverlaySize(-OverlaySizePolicy.WIDTH_STEP_DP, 0)
                },
                rightLabel = "가로 늘리기",
                rightAction = {
                    adjustOverlaySize(OverlaySizePolicy.WIDTH_STEP_DP, 0)
                },
            ),
            marginParams(top = 8, bottom = 4),
        )
        root.addView(
            pairedButtons(
                leftLabel = "세로 줄이기",
                leftAction = {
                    adjustOverlaySize(0, -OverlaySizePolicy.HEIGHT_STEP_DP)
                },
                rightLabel = "세로 늘리기",
                rightAction = {
                    adjustOverlaySize(0, OverlaySizePolicy.HEIGHT_STEP_DP)
                },
            ),
            marginParams(bottom = 4),
        )
        root.addView(Button(this).apply {
            text = "오버레이 기본 크기로 되돌리기"
            isAllCaps = false
            setOnClickListener {
                updateOverlaySizeText(DestinationOverlayService.resetSize(this@MainActivity))
            }
        }, marginParams(bottom = 6))

        root.addView(Button(this).apply {
            text = "샘플 주소로 오버레이 레이아웃 테스트"
            isAllCaps = false
            setOnClickListener {
                startActivity(Intent(this@MainActivity, OverlayPreviewActivity::class.java))
            }
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
            text = "원본 목적지를 선택한 지도 앱으로 열기"
            isAllCaps = false
            setOnClickListener { forwardCurrentCapture() }
        }, marginParams(bottom = 8))

        root.addView(sectionTitle("현재 목적지"))
        detailText = cardText("목적지가 들어오면 이곳에 표시됩니다.", 14f, false).apply {
            setTextIsSelectable(true)
        }
        root.addView(detailText)

        editMemoButton = Button(this).apply {
            text = "현재 장소 메모 수정"
            isAllCaps = false
            isEnabled = false
            setOnClickListener { openCurrentMemoEditor() }
        }
        root.addView(editMemoButton, marginParams(top = 9, bottom = 7))

        root.addView(Button(this).apply {
            text = "주소별 메모장 열기"
            isAllCaps = false
            setOnClickListener {
                startActivity(Intent(this@MainActivity, AddressMemoActivity::class.java))
            }
        }, marginParams(bottom = 8))

        root.addView(sectionTitle("최근 목적지"))
        historyText = cardText("기록 없음", 13f, false).apply {
            setTextIsSelectable(true)
        }
        root.addView(historyText)

        root.addView(Button(this).apply {
            text = "목적지 기록 모두 지우기"
            isAllCaps = false
            setOnClickListener {
                captureStore.clear()
                currentCapture = null
                currentEntry = null
                DestinationOverlayService.hide(this@MainActivity)
                detailText.text = "목적지 기록을 지웠습니다. 주소별 개인 메모는 유지됩니다."
                statusText.text = "새 길찾기 호출을 기다리는 중"
                editMemoButton.isEnabled = false
                renderHistory()
            }
        }, marginParams(top = 12))

        root.addView(TextView(this).apply {
            text = "배달앱 원문·원본 URI·좌표는 내비 연결용으로 그대로 유지됩니다. 자동 도로명주소는 오버레이 참고용이며 실제 목적지를 바꾸지 않습니다."
            textSize = 12f
            setTextColor(Color.rgb(90, 97, 108))
            setPadding(dp(4), dp(16), dp(4), 0)
        })

        setContentView(scroll)
        updateOverlayPermissionUi()
    }

    private fun handleIncomingIntent(intent: Intent?, synthetic: Boolean = false) {
        if (intent == null) return

        val relayedCapture = readRelayedCapture(intent)
        if (!synthetic && intent.data == null && relayedCapture == null) {
            restoreLatestDestination()
            return
        }

        val capture = relayedCapture ?: parser.parse(intent)
        if (!isMeaningful(capture)) {
            restoreLatestDestination()
            return
        }

        currentCapture = capture
        val saved = captureStore.save(capture)
        currentEntry = addressMemoStore.ensureForCapture(capture)
        val origin = if (synthetic) "샘플 목적지 확인" else "원본 목적지 수신 성공"
        renderCurrentDestination(if (saved) origin else "$origin · 중복 기록 생략")
        renderHistory()
        showDestinationOverlay()
        resolveRoadAddressIfNeeded(capture, requireNotNull(currentEntry))

        if (!synthetic && autoForwardSwitch.isChecked) scheduleForward()
    }

    private fun readRelayedCapture(intent: Intent): CapturedDestination? {
        val raw = intent.getStringExtra(EXTRA_RELAY_CAPTURE_JSON) ?: return null
        return runCatching { CapturedDestination.fromJson(JSONObject(raw)) }.getOrNull()
    }

    private fun restoreLatestDestination() {
        val capture = captureStore.load().firstOrNull(::isMeaningful)
        if (capture == null) {
            statusText.text = "저장된 목적지가 없습니다."
            return
        }
        currentCapture = capture
        currentEntry = addressMemoStore.ensureForCapture(capture)
        renderCurrentDestination("최근 원본 목적지 복원")
        renderHistory()
    }

    private fun resolveRoadAddressIfNeeded(
        capture: CapturedDestination,
        initialEntry: AddressMemoEntry,
    ) {
        if (initialEntry.roadAddress.isNotBlank() || initialEntry.roadAddressConfirmed) return
        val latitude = capture.latitude ?: return
        val longitude = capture.longitude ?: return
        statusText.text = "원본 목적지 저장 완료 · 참고 도로명주소 확인 중"

        addressResolver.resolve(
            destinationName = capture.destinationName,
            latitude = latitude,
            longitude = longitude,
        ) { result ->
            result.onSuccess { resolved ->
                val latest = addressMemoStore.findById(initialEntry.id) ?: return@onSuccess
                if (latest.roadAddress.isNotBlank() || latest.roadAddressConfirmed) return@onSuccess
                if (resolved.roadAddress.isBlank()) return@onSuccess
                val saved = addressMemoStore.save(
                    latest.copy(roadAddress = resolved.roadAddress),
                )
                if (currentEntry?.id == saved.id) {
                    currentEntry = saved
                    renderCurrentDestination("원본 유지 · 참고 주소 확인 완료")
                    renderHistory()
                    showDestinationOverlay()
                }
            }.onFailure {
                if (currentEntry?.id == initialEntry.id) {
                    statusText.text = "원본 목적지는 저장됨 · 참고 주소는 미확인"
                }
            }
        }
    }

    private fun openCurrentMemoEditor() {
        val entry = currentEntry ?: run {
            toast("먼저 목적지를 받아야 합니다.")
            return
        }
        startActivity(MemoEditorActivity.intent(this, entry.id, true))
    }

    private fun showDestinationOverlay() {
        val entry = currentEntry ?: return
        if (!overlaySwitch.isChecked) return
        if (!Settings.canDrawOverlays(this)) {
            statusText.text = "원본 목적지 저장 성공 · 오버레이 권한 필요"
            updateOverlayPermissionUi()
            return
        }
        DestinationOverlayService.show(this, entry)
    }

    private fun adjustOverlaySize(widthDeltaDp: Int, heightDeltaDp: Int) {
        val size = DestinationOverlayService.adjustSize(
            context = this,
            widthDeltaDp = widthDeltaDp,
            heightDeltaDp = heightDeltaDp,
        )
        updateOverlaySizeText(size)
    }

    private fun updateOverlaySizeText(
        size: OverlaySize = DestinationOverlayService.currentSize(this),
    ) {
        overlaySizeText.text = buildString {
            append("현재 크기  가로 ${size.widthDp}dp · 세로 ${size.heightDp}dp")
            append("\n10dp 단위로 조절 · 최소 180dp × 110dp")
            append("\n버튼을 누르면 떠 있는 오버레이에도 바로 적용됩니다.")
        }
    }

    private fun scheduleForward() {
        pendingForward?.let(handler::removeCallbacks)
        pendingForward = Runnable { forwardCurrentCapture() }.also {
            handler.postDelayed(it, AUTO_FORWARD_DELAY_MS)
        }
        statusText.text = "원본 목적지를 그대로 지도 앱으로 전달합니다"
    }

    private fun forwardCurrentCapture() {
        val capture = currentCapture ?: captureStore.load().firstOrNull(::isMeaningful)
        if (capture == null) {
            toast("먼저 길찾기 전달값을 받아야 합니다.")
            return
        }
        val requested = NavApp.entries[navSpinner.selectedItemPosition.coerceAtLeast(0)]
        forwarder.forward(capture, requested)
            .onSuccess { app ->
                statusText.text = if (app == NavApp.PICK_EACH_TIME) {
                    "원본 목적지 유지 · 지도 앱을 선택하세요"
                } else {
                    "원본 목적지 유지 · ${app.label} 실행"
                }
            }
            .onFailure { error ->
                statusText.text = "지도 앱 실행 실패"
                toast(error.message ?: "지도 앱을 열지 못했습니다.")
            }
    }

    private fun openOverlayPermissionSettings() {
        val permissionIntent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName"),
        )
        runCatching { startActivity(permissionIntent) }
            .onFailure { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)) }
    }

    private fun updateOverlayPermissionUi() {
        if (!::overlayPermissionButton.isInitialized) return
        overlayPermissionButton.text = if (Settings.canDrawOverlays(this)) {
            "오버레이 권한 허용됨 · 설정 열기"
        } else {
            "오버레이 권한 허용하기"
        }
    }

    private fun renderCurrentDestination(headline: String) {
        val capture = currentCapture
        val entry = currentEntry
        editMemoButton.isEnabled = entry != null
        statusText.text = headline
        detailText.text = if (capture == null || entry == null) {
            "현재 목적지 없음"
        } else {
            buildString {
                appendLine("배달앱 원문: ${capture.destinationName.ifBlank { "이름 없음" }}")
                entry.placeName.takeIf(String::isNotBlank)?.let {
                    appendLine("내 표시 이름: $it")
                }
                entry.roadAddress.takeIf(String::isNotBlank)?.let {
                    appendLine("참고 도로명주소: $it")
                }
                appendLine("개인 메모: ${entry.memo.ifBlank { "없음" }}")
                append("수신 시각: ${formatTime(capture.capturedAt)}")
            }
        }
    }

    private fun renderHistory() {
        val captures = captureStore.load().filter(::isMeaningful)
        historyText.text = if (captures.isEmpty()) {
            "기록 없음"
        } else {
            captures.take(10).mapIndexed { index, capture ->
                val entry = addressMemoStore.findForCapture(capture)
                buildString {
                    append("${index + 1}. ${formatTime(capture.capturedAt)}")
                    append(" · ${capture.destinationName.ifBlank { "배달 목적지" }}")
                    entry?.roadAddress?.takeIf(String::isNotBlank)?.let {
                        append("\n   참고 도로명: $it")
                    }
                    entry?.memo?.takeIf(String::isNotBlank)?.let {
                        append("\n   메모: ${it.take(100)}")
                    }
                }
            }.joinToString("\n\n")
        }
    }

    private fun isMeaningful(capture: CapturedDestination): Boolean =
        capture.hasCoordinates || capture.destinationName.isNotBlank() || capture.rawUri.isNotBlank()

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

    private fun pairedButtons(
        leftLabel: String,
        leftAction: () -> Unit,
        rightLabel: String,
        rightAction: () -> Unit,
    ): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        row.addView(
            Button(this).apply {
                text = leftLabel
                isAllCaps = false
                setOnClickListener { leftAction() }
            },
            LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f,
            ).apply {
                marginEnd = dp(4)
            },
        )
        row.addView(
            Button(this).apply {
                text = rightLabel
                isAllCaps = false
                setOnClickListener { rightAction() }
            },
            LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f,
            ).apply {
                marginStart = dp(4)
            },
        )
        return row
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
        const val EXTRA_RELAY_CAPTURE_JSON = "com.winzfs.navcapture.extra.RELAY_CAPTURE_JSON"

        private const val SETTINGS_NAME = "nav_capture_settings"
        private const val KEY_AUTO_FORWARD = "auto_forward"
        private const val KEY_NAV_APP = "nav_app"
        private const val KEY_OVERLAY_ENABLED = "overlay_enabled"
        private const val AUTO_FORWARD_DELAY_MS = 550L

        fun relayIntent(context: Context, capture: CapturedDestination): Intent =
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra(EXTRA_RELAY_CAPTURE_JSON, capture.toJson().toString())
            }
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
