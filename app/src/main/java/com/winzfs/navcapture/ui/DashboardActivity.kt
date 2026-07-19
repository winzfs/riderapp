package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.storage.AddressMemoStore
import com.winzfs.navcapture.storage.CaptureStore

class DashboardActivity : Activity() {
    private lateinit var currentDestinationText: TextView
    private lateinit var currentDetailText: TextView
    private lateinit var permissionText: TextView

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
                subtitleText = "배달 목적지와 개인 메모를 빠르게 확인합니다.",
                showBack = false,
            ),
        )

        val currentCard = RiderUi.card(this, "현재 목적지", "가장 최근에 받은 목적지 정보입니다.")
        currentDestinationText = TextView(this).apply {
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(RiderUi.title)
            setPadding(0, RiderUi.dp(this@DashboardActivity, 13), 0, 0)
        }
        currentDetailText = TextView(this).apply {
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.16f)
            setPadding(0, RiderUi.dp(this@DashboardActivity, 6), 0, 0)
        }
        currentCard.addView(currentDestinationText)
        currentCard.addView(currentDetailText)
        currentCard.addView(
            RiderUi.primaryButton(this, "현재 목적지 상세 열기") {
                startActivity(Intent(this, MainActivity::class.java))
            },
            RiderUi.fullWidth(this, top = 14, heightDp = 47),
        )
        root.addView(currentCard, RiderUi.fullWidth(this, bottom = 12))

        val statusCard = RiderUi.card(this)
        val statusRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        statusRow.addView(TextView(this).apply {
            text = "오버레이 상태"
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(RiderUi.title)
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        permissionText = TextView(this).apply {
            textSize = 12.5f
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setPadding(
                RiderUi.dp(this@DashboardActivity, 11),
                RiderUi.dp(this@DashboardActivity, 7),
                RiderUi.dp(this@DashboardActivity, 11),
                RiderUi.dp(this@DashboardActivity, 7),
            )
        }
        statusRow.addView(permissionText)
        statusCard.addView(statusRow)
        statusCard.addView(TextView(this).apply {
            text = "권한과 크기·색상·투명도는 오버레이 설정에서 관리합니다."
            textSize = 12.5f
            setTextColor(RiderUi.muted)
            setPadding(0, RiderUi.dp(this@DashboardActivity, 8), 0, 0)
        })
        root.addView(statusCard, RiderUi.fullWidth(this, bottom = 16))

        root.addView(RiderUi.sectionLabel(this, "빠른 메뉴"))
        root.addView(
            menuRow(
                menuTile("오버레이 설정", "크기·배경·글자·윤곽선") {
                    startActivity(Intent(this, AppSettingsActivity::class.java))
                },
                menuTile("샘플 테스트", "실제 레이아웃 미리보기") {
                    startActivity(Intent(this, OverlayPreviewActivity::class.java))
                },
            ),
            RiderUi.fullWidth(this, bottom = 9),
        )
        root.addView(
            menuRow(
                menuTile("주소 메모", "주소별 개인 메모 관리") {
                    startActivity(Intent(this, AddressMemoActivity::class.java))
                },
                menuTile("오버레이 닫기", "현재 떠 있는 창 종료") {
                    DestinationOverlayService.hide(this)
                    renderStatus()
                },
            ),
            RiderUi.fullWidth(this, bottom = 14),
        )

        val guideCard = RiderUi.card(this, "작동 방식")
        guideCard.addView(TextView(this).apply {
            text = "배달앱에서 길찾기를 누르면 원본 목적지는 그대로 내비에 전달되고, 주소와 메모만 오버레이에 표시됩니다."
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.2f)
            setPadding(0, RiderUi.dp(this@DashboardActivity, 8), 0, 0)
        })
        root.addView(guideCard, RiderUi.fullWidth(this))

        setContentView(page.scroll)
    }

    private fun menuRow(left: LinearLayout, right: LinearLayout): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(left, RiderUi.weighted(this@DashboardActivity, end = 5, heightDp = 116))
        addView(right, RiderUi.weighted(this@DashboardActivity, start = 5, heightDp = 116))
    }

    private fun menuTile(titleText: String, description: String, action: () -> Unit): LinearLayout =
        RiderUi.card(this, paddingDp = 14).apply {
            gravity = Gravity.CENTER_VERTICAL
            isClickable = true
            isFocusable = true
            background = RiderUi.ripple(
                context = this@DashboardActivity,
                color = RiderUi.surface,
                radiusDp = 18f,
                strokeColor = RiderUi.border,
                strokeWidthDp = 1,
            )
            addView(TextView(this@DashboardActivity).apply {
                text = titleText
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(RiderUi.title)
            })
            addView(TextView(this@DashboardActivity).apply {
                text = description
                textSize = 12f
                setTextColor(RiderUi.muted)
                setLineSpacing(0f, 1.12f)
                setPadding(0, RiderUi.dp(this@DashboardActivity, 6), 0, 0)
            })
            setOnClickListener { action() }
        }

    private fun renderStatus() {
        if (!::currentDestinationText.isInitialized) return
        val capture = CaptureStore(this).load().firstOrNull()
        val entry = capture?.let { AddressMemoStore(this).findForCapture(it) }
        currentDestinationText.text = when {
            entry?.placeName?.isNotBlank() == true -> entry.placeName
            capture?.destinationName?.isNotBlank() == true -> capture.destinationName
            else -> "아직 받은 목적지가 없습니다"
        }
        currentDetailText.text = buildString {
            entry?.roadAddress?.takeIf(String::isNotBlank)?.let { appendLine(it) }
            if (entry?.memo?.isNotBlank() == true) {
                append("메모 · ${entry.memo.take(100)}")
            } else if (capture == null) {
                append("배달앱에서 길찾기를 누르면 여기에 표시됩니다.")
            } else {
                append("저장된 개인 메모가 없습니다.")
            }
        }

        val permissionGranted = Settings.canDrawOverlays(this)
        permissionText.text = if (permissionGranted) "사용 가능" else "권한 필요"
        permissionText.setTextColor(if (permissionGranted) RiderUi.success else RiderUi.danger)
        permissionText.background = RiderUi.rounded(
            color = if (permissionGranted) 0xFFEAF7F0.toInt() else 0xFFFFEEEE.toInt(),
            radiusDp = 20f,
            context = this,
        )
    }
}
