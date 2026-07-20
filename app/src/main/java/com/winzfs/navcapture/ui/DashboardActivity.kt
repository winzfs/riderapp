package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.widget.LinearLayout
import android.widget.TextView
import com.winzfs.navcapture.storage.AddressMemoStore
import com.winzfs.navcapture.storage.CaptureStore

class DashboardActivity : Activity() {
    private lateinit var currentDestinationText: TextView
    private lateinit var currentDetailText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        renderStatus()
    }

    private fun buildUi() {
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "RiderApp",
                subtitleText = "배달 목적지와 메모를 빠르게 확인합니다.",
                showBack = false,
            ),
        )

        val currentCard = RiderUi.card(this, "현재 목적지")
        currentDestinationText = TextView(this).apply {
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(RiderUi.title)
            setPadding(0, RiderUi.dp(this@DashboardActivity, 12), 0, 0)
        }
        currentDetailText = TextView(this).apply {
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.17f)
            setPadding(0, RiderUi.dp(this@DashboardActivity, 7), 0, 0)
        }
        currentCard.addView(currentDestinationText)
        currentCard.addView(currentDetailText)
        currentCard.addView(
            RiderUi.primaryButton(this, "목적지 열기") {
                startActivity(Intent(this, MainActivity::class.java))
            },
            RiderUi.fullWidth(this, top = 13, heightDp = 47),
        )
        root.addView(currentCard, RiderUi.fullWidth(this, bottom = 12))

        val menuCard = RiderUi.card(
            context = this,
            titleText = "메뉴",
            subtitleText = "설정과 개발 도구를 필요한 화면에서만 엽니다.",
        )
        menuCard.addView(
            pairedButtons(
                "오버레이 설정" to AppSettingsActivity::class.java,
                "샘플 테스트" to OverlayPreviewActivity::class.java,
            ),
            RiderUi.fullWidth(this, top = 11),
        )
        menuCard.addView(
            pairedButtons(
                "주소 메모" to AddressMemoActivity::class.java,
                "수신 기록" to IntentDiagnosticsActivity::class.java,
            ),
            RiderUi.fullWidth(this, top = 8),
        )
        root.addView(menuCard, RiderUi.fullWidth(this))

        setContentView(page.scroll)
    }

    private fun pairedButtons(
        left: Pair<String, Class<out Activity>>,
        right: Pair<String, Class<out Activity>>,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(
            RiderUi.secondaryButton(this@DashboardActivity, left.first) {
                startActivity(Intent(this@DashboardActivity, left.second))
            },
            RiderUi.weighted(this@DashboardActivity, end = 4, heightDp = 46),
        )
        addView(
            RiderUi.secondaryButton(this@DashboardActivity, right.first) {
                startActivity(Intent(this@DashboardActivity, right.second))
            },
            RiderUi.weighted(this@DashboardActivity, start = 4, heightDp = 46),
        )
    }

    private fun renderStatus() {
        if (!::currentDestinationText.isInitialized) return
        val capture = CaptureStore(this).load().firstOrNull()
        val entry = capture?.let { AddressMemoStore(this).findForCapture(it) }

        currentDestinationText.text = when {
            entry?.placeName?.isNotBlank() == true -> entry.placeName
            capture?.destinationName?.isNotBlank() == true -> capture.destinationName
            entry?.roadAddress?.isNotBlank() == true -> entry.roadAddress
            else -> "아직 받은 목적지가 없습니다"
        }

        currentDetailText.text = buildString {
            entry?.roadAddress?.takeIf(String::isNotBlank)?.let { appendLine(it) }
            when {
                entry?.memo?.isNotBlank() == true -> appendLine("메모 · ${entry.memo.take(100)}")
                capture == null -> appendLine("배달앱에서 길찾기를 누르면 여기에 표시됩니다.")
                else -> appendLine("저장된 메모 없음")
            }
            if (!Settings.canDrawOverlays(this@DashboardActivity)) {
                append("오버레이 권한 필요")
            }
        }.trim()
    }
}
