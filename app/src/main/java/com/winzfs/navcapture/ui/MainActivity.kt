package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.address.RoadAddressResolver
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.model.CapturedDestination
import com.winzfs.navcapture.navigation.NavApp
import com.winzfs.navcapture.navigation.NavigationForwarder
import com.winzfs.navcapture.overlay.DestinationOverlayService
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
    private lateinit var destinationTitle: TextView
    private lateinit var detailText: TextView
    private lateinit var historyText: TextView
    private lateinit var editMemoButton: android.widget.Button

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
        currentEntry?.let { oldEntry ->
            addressMemoStore.findById(oldEntry.id)?.let { refreshed ->
                currentEntry = refreshed
                renderCurrentDestination("현재 목적지")
                if (overlayEnabled() && Settings.canDrawOverlays(this)) {
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
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "목적지 상세",
                subtitleText = "원본 목적지는 그대로 유지하고 표시 정보와 메모만 관리합니다.",
            ),
        )

        val statusCard = RiderUi.card(this)
        statusText = TextView(this).apply {
            text = "아직 길찾기 호출을 받지 않았습니다."
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.15f)
        }
        statusCard.addView(statusText)
        root.addView(statusCard, RiderUi.fullWidth(this, bottom = 12))

        val destinationCard = RiderUi.card(this, "현재 목적지")
        destinationTitle = TextView(this).apply {
            text = "목적지가 들어오면 여기에 표시됩니다."
            textSize = 20f
            setTextColor(RiderUi.title)
            setPadding(0, RiderUi.dp(this@MainActivity, 10), 0, 0)
        }
        detailText = TextView(this).apply {
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.18f)
            setTextIsSelectable(true)
            setPadding(0, RiderUi.dp(this@MainActivity, 8), 0, 0)
        }
        destinationCard.addView(destinationTitle)
        destinationCard.addView(detailText)
        root.addView(destinationCard, RiderUi.fullWidth(this, bottom = 12))

        root.addView(
            RiderUi.primaryButton(this, "원본 목적지를 지도 앱으로 열기") {
                forwardCurrentCapture()
            },
            RiderUi.fullWidth(this, bottom = 8, heightDp = 50),
        )

        val actionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        editMemoButton = RiderUi.secondaryButton(this, "현재 장소 메모") {
            openCurrentMemoEditor()
        }.apply { isEnabled = false }
        actionRow.addView(editMemoButton, RiderUi.weighted(this, end = 4, heightDp = 46))
        actionRow.addView(
            RiderUi.secondaryButton(this, "오버레이 설정") {
                startActivity(Intent(this@MainActivity, AppSettingsActivity::class.java))
            },
            RiderUi.weighted(this, start = 4, heightDp = 46),
        )
        root.addView(actionRow, RiderUi.fullWidth(this, bottom = 12))

        val historyCard = RiderUi.card(this, "최근 목적지", "최근 10건만 간단히 표시합니다.")
        historyText = TextView(this).apply {
            text = "기록 없음"
            textSize = 12.5f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.18f)
            setTextIsSelectable(true)
            setPadding(0, RiderUi.dp(this@MainActivity, 10), 0, 0)
        }
        historyCard.addView(historyText)
        historyCard.addView(
            RiderUi.secondaryButton(this, "주소 메모 전체 보기") {
                startActivity(Intent(this@MainActivity, AddressMemoActivity::class.java))
            },
            RiderUi.fullWidth(this, top = 12, heightDp = 44),
        )
        root.addView(historyCard, RiderUi.fullWidth(this, bottom = 12))

        root.addView(
            RiderUi.dangerButton(this, "최근 목적지 기록 지우기") {
                captureStore.clear()
                currentCapture = null
                currentEntry = null
                DestinationOverlayService.hide(this@MainActivity)
                destinationTitle.text = "현재 목적지 없음"
                detailText.text = "목적지 기록을 지웠습니다. 주소별 개인 메모는 유지됩니다."
                statusText.text = "새 길찾기 호출을 기다리는 중입니다."
                editMemoButton.isEnabled = false
                renderHistory()
            },
            RiderUi.fullWidth(this, heightDp = 46),
        )

        setContentView(page.scroll)
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
        val origin = if (synthetic) "샘플 목적지 확인" else "원본 목적지 수신 완료"
        renderCurrentDestination(if (saved) origin else "$origin · 중복 기록 생략")
        renderHistory()
        showDestinationOverlay()
        resolveRoadAddressIfNeeded(capture, requireNotNull(currentEntry))

        if (!synthetic && autoForwardEnabled()) scheduleForward()
    }

    private fun readRelayedCapture(intent: Intent): CapturedDestination? {
        val raw = intent.getStringExtra(EXTRA_RELAY_CAPTURE_JSON) ?: return null
        return runCatching { CapturedDestination.fromJson(JSONObject(raw)) }.getOrNull()
    }

    private fun restoreLatestDestination() {
        val capture = captureStore.load().firstOrNull(::isMeaningful)
        if (capture == null) {
            statusText.text = "저장된 목적지가 없습니다."
            destinationTitle.text = "현재 목적지 없음"
            detailText.text = "배달앱에서 길찾기를 누르면 목적지가 표시됩니다."
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
        statusText.text = "원본 목적지 저장 완료 · 참고 주소 확인 중"

        addressResolver.resolve(
            destinationName = capture.destinationName,
            latitude = latitude,
            longitude = longitude,
        ) { result ->
            result.onSuccess { resolved ->
                val latest = addressMemoStore.findById(initialEntry.id) ?: return@onSuccess
                if (latest.roadAddress.isNotBlank() || latest.roadAddressConfirmed) return@onSuccess
                if (resolved.roadAddress.isBlank()) return@onSuccess
                val saved = addressMemoStore.save(latest.copy(roadAddress = resolved.roadAddress))
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
        if (!overlayEnabled()) return
        if (!Settings.canDrawOverlays(this)) {
            statusText.text = "원본 목적지 저장 완료 · 오버레이 권한 필요"
            return
        }
        DestinationOverlayService.show(this, entry)
    }

    private fun scheduleForward() {
        pendingForward?.let(handler::removeCallbacks)
        pendingForward = Runnable { forwardCurrentCapture() }.also {
            handler.postDelayed(it, AUTO_FORWARD_DELAY_MS)
        }
        statusText.text = "원본 목적지를 그대로 지도 앱으로 전달합니다."
    }

    private fun forwardCurrentCapture() {
        val capture = currentCapture ?: captureStore.load().firstOrNull(::isMeaningful)
        if (capture == null) {
            toast("먼저 길찾기 전달값을 받아야 합니다.")
            return
        }
        val requested = selectedNavApp()
        forwarder.forward(capture, requested)
            .onSuccess { app ->
                statusText.text = if (app == NavApp.PICK_EACH_TIME) {
                    "원본 목적지 유지 · 지도 앱을 선택하세요."
                } else {
                    "원본 목적지 유지 · ${app.label} 실행"
                }
            }
            .onFailure { error ->
                statusText.text = "지도 앱 실행 실패"
                toast(error.message ?: "지도 앱을 열지 못했습니다.")
            }
    }

    private fun renderCurrentDestination(headline: String) {
        val capture = currentCapture
        val entry = currentEntry
        editMemoButton.isEnabled = entry != null
        statusText.text = headline
        if (capture == null || entry == null) {
            destinationTitle.text = "현재 목적지 없음"
            detailText.text = "목적지를 받으면 이곳에 표시됩니다."
            return
        }

        destinationTitle.text = entry.placeName.ifBlank {
            capture.destinationName.ifBlank { "배달 목적지" }
        }
        detailText.text = buildString {
            appendLine("배달앱 원문 · ${capture.destinationName.ifBlank { "이름 없음" }}")
            entry.roadAddress.takeIf(String::isNotBlank)?.let {
                appendLine("참고 주소 · $it")
            }
            appendLine("개인 메모 · ${entry.memo.ifBlank { "없음" }}")
            append("수신 시각 · ${formatTime(capture.capturedAt)}")
        }
    }

    private fun renderHistory() {
        if (!::historyText.isInitialized) return
        val captures = captureStore.load().filter(::isMeaningful)
        historyText.text = if (captures.isEmpty()) {
            "기록 없음"
        } else {
            captures.take(10).mapIndexed { index, capture ->
                val entry = addressMemoStore.findForCapture(capture)
                buildString {
                    append("${index + 1}. ${capture.destinationName.ifBlank { "배달 목적지" }}")
                    append("  ·  ${formatTime(capture.capturedAt)}")
                    entry?.memo?.takeIf(String::isNotBlank)?.let {
                        append("\n   ${it.take(80)}")
                    }
                }
            }.joinToString("\n\n")
        }
    }

    private fun selectedNavApp(): NavApp = NavApp.fromStored(
        settings().getString(KEY_NAV_APP, null),
    )

    private fun autoForwardEnabled(): Boolean = settings().getBoolean(KEY_AUTO_FORWARD, true)
    private fun overlayEnabled(): Boolean = settings().getBoolean(KEY_OVERLAY_ENABLED, true)

    private fun isMeaningful(capture: CapturedDestination): Boolean =
        capture.hasCoordinates || capture.destinationName.isNotBlank() || capture.rawUri.isNotBlank()

    private fun settings() = getSharedPreferences(SETTINGS_NAME, MODE_PRIVATE)

    private fun formatTime(timestamp: Long): String =
        SimpleDateFormat("MM-dd HH:mm:ss", Locale.KOREA).format(Date(timestamp))

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

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
