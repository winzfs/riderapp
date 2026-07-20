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
                titleText = "목적지",
                subtitleText = "배달앱에서 받은 원본 목적지를 그대로 사용합니다.",
            ),
        )

        val destinationCard = RiderUi.card(this, "현재 목적지")
        statusText = TextView(this).apply {
            text = "배달앱에서 길찾기를 누르면 목적지를 받습니다."
            textSize = 12.5f
            setTextColor(RiderUi.muted)
            setLineSpacing(0f, 1.12f)
            setPadding(0, RiderUi.dp(this@MainActivity, 8), 0, 0)
        }
        destinationTitle = TextView(this).apply {
            text = "아직 받은 목적지가 없습니다"
            textSize = 21f
            setTextColor(RiderUi.title)
            setPadding(0, RiderUi.dp(this@MainActivity, 10), 0, 0)
        }
        detailText = TextView(this).apply {
            text = "주소와 메모가 여기에 표시됩니다."
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.2f)
            setTextIsSelectable(true)
            setPadding(0, RiderUi.dp(this@MainActivity, 8), 0, 0)
        }
        destinationCard.addView(statusText)
        destinationCard.addView(destinationTitle)
        destinationCard.addView(detailText)
        root.addView(destinationCard, RiderUi.fullWidth(this, bottom = 12))

        root.addView(
            RiderUi.primaryButton(this, "지도 앱으로 열기") {
                forwardCurrentCapture()
            },
            RiderUi.fullWidth(this, bottom = 8, heightDp = 50),
        )

        val actionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        editMemoButton = RiderUi.secondaryButton(this, "메모 수정") {
            openCurrentMemoEditor()
        }.apply { isEnabled = false }
        actionRow.addView(editMemoButton, RiderUi.weighted(this, end = 4, heightDp = 46))
        actionRow.addView(
            RiderUi.secondaryButton(this, "오버레이 설정") {
                startActivity(Intent(this@MainActivity, AppSettingsActivity::class.java))
            },
            RiderUi.weighted(this, start = 4, heightDp = 46),
        )
        root.addView(actionRow, RiderUi.fullWidth(this))

        setContentView(page.scroll)
    }

    private fun handleIncomingIntent(intent: Intent?, synthetic: Boolean = false) {
        if (intent == null) return

        // Some delivery apps put apartment destinations only in Extras or ClipData.
        // Parse the entire Intent before deciding that it has no destination.
        val relayedCapture = readRelayedCapture(intent)
        val capture = relayedCapture ?: parser.parse(intent)
        if (!isMeaningful(capture)) {
            restoreLatestDestination()
            return
        }

        currentCapture = capture
        val saved = captureStore.save(capture)
        currentEntry = addressMemoStore.ensureForCapture(capture)
        val origin = if (synthetic) "샘플 목적지" else "목적지 수신 완료"
        renderCurrentDestination(if (saved) origin else "$origin · 동일 호출")
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
            statusText.text = "새 목적지를 기다리는 중"
            destinationTitle.text = "아직 받은 목적지가 없습니다"
            detailText.text = "배달앱에서 길찾기를 누르면 주소와 메모가 표시됩니다."
            editMemoButton.isEnabled = false
            return
        }
        currentCapture = capture
        currentEntry = addressMemoStore.ensureForCapture(capture)
        renderCurrentDestination("최근 목적지")
    }

    private fun resolveRoadAddressIfNeeded(
        capture: CapturedDestination,
        initialEntry: AddressMemoEntry,
    ) {
        if (initialEntry.roadAddress.isNotBlank() || initialEntry.roadAddressConfirmed) return
        val latitude = capture.latitude ?: return
        val longitude = capture.longitude ?: return
        statusText.text = "주소 확인 중"

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
                    renderCurrentDestination("목적지 수신 완료")
                    showDestinationOverlay()
                }
            }.onFailure {
                if (currentEntry?.id == initialEntry.id) {
                    statusText.text = "목적지는 저장됨 · 참고 주소 미확인"
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
            statusText.text = "목적지 수신 완료 · 오버레이 권한 필요"
            return
        }
        DestinationOverlayService.show(this, entry)
    }

    private fun scheduleForward() {
        pendingForward?.let(handler::removeCallbacks)
        pendingForward = Runnable { forwardCurrentCapture() }.also {
            handler.postDelayed(it, AUTO_FORWARD_DELAY_MS)
        }
        statusText.text = "지도 앱으로 연결 중"
    }

    private fun forwardCurrentCapture() {
        val capture = currentCapture ?: captureStore.load().firstOrNull(::isMeaningful)
        if (capture == null) {
            toast("먼저 길찾기 목적지를 받아야 합니다.")
            return
        }
        forwarder.forward(capture, selectedNavApp())
            .onSuccess { app ->
                statusText.text = if (app == NavApp.PICK_EACH_TIME) {
                    "사용할 지도 앱을 선택하세요"
                } else {
                    "${app.label} 실행"
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
            detailText.text = "목적지를 받으면 주소와 메모가 표시됩니다."
            return
        }

        destinationTitle.text = entry.placeName.ifBlank {
            capture.destinationName.ifBlank {
                entry.roadAddress.ifBlank { "배달 목적지" }
            }
        }
        detailText.text = buildString {
            capture.destinationName.takeIf(String::isNotBlank)?.let {
                appendLine("원문 · $it")
            }
            entry.roadAddress.takeIf(String::isNotBlank)?.let {
                appendLine("주소 · $it")
            }
            if (capture.hasCoordinates) {
                appendLine("좌표 · ${capture.latitude}, ${capture.longitude}")
            }
            appendLine("메모 · ${entry.memo.ifBlank { "없음" }}")
            append("수신 · ${formatTime(capture.capturedAt)}")
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
