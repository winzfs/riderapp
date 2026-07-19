package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.storage.AddressMemoStore
import com.winzfs.navcapture.storage.CaptureStore

class DashboardActivity : Activity() {
    private lateinit var currentDestinationText: TextView
    private lateinit var overlayStatusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        renderStatus()
    }

    private fun buildUi() {
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(PAGE_BACKGROUND)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(22), dp(18), dp(34))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "RiderApp"
            textSize = 29f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(TITLE_COLOR)
        })
        root.addView(TextView(this).apply {
            text = "목적지 주소와 개인 메모를 빠르게 확인합니다."
            textSize = 14f
            setTextColor(SUBTITLE_COLOR)
            setPadding(0, dp(5), 0, dp(18))
        })

        val currentCard = card().apply {
            addView(TextView(this@DashboardActivity).apply {
                text = "현재 목적지"
                textSize = 13f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(ACCENT_COLOR)
            })
            currentDestinationText = TextView(this@DashboardActivity).apply {
                textSize = 19f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(TITLE_COLOR)
                setPadding(0, dp(8), 0, dp(4))
            }
            addView(currentDestinationText)
            overlayStatusText = TextView(this@DashboardActivity).apply {
                textSize = 13f
                setTextColor(SUBTITLE_COLOR)
            }
            addView(overlayStatusText)
            addView(primaryButton("현재 목적지 상세 열기") {
                startActivity(Intent(this@DashboardActivity, MainActivity::class.java))
            }, fullWidthParams(top = 13))
        }
        root.addView(currentCard, fullWidthParams(bottom = 12))

        root.addView(TextView(this).apply {
            text = "메뉴"
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(TITLE_COLOR)
            setPadding(dp(2), dp(5), dp(2), dp(8))
        })

        root.addView(
            menuRow(
                menuButton("오버레이 설정", "크기·색상·투명도") {
                    startActivity(Intent(this, AppSettingsActivity::class.java))
                },
                menuButton("주소 메모", "주소별 메모 관리") {
                    startActivity(Intent(this, AddressMemoActivity::class.java))
                },
            ),
            fullWidthParams(bottom = 8),
        )
        root.addView(
            menuRow(
                menuButton("샘플 테스트", "실제 오버레이 미리보기") {
                    startActivity(Intent(this, OverlayPreviewActivity::class.java))
                },
                menuButton("오버레이 닫기", "현재 떠 있는 창 종료") {
                    DestinationOverlayService.hide(this)
                    renderStatus()
                },
            ),
            fullWidthParams(bottom = 12),
        )

        val guideCard = card().apply {
            addView(TextView(this@DashboardActivity).apply {
                text = "사용 흐름"
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(TITLE_COLOR)
            })
            addView(TextView(this@DashboardActivity).apply {
                text = "배달앱에서 길찾기를 누르면 원본 목적지는 그대로 내비에 전달되고, 주소와 메모만 오버레이로 표시됩니다."
                textSize = 13f
                setTextColor(SUBTITLE_COLOR)
                setLineSpacing(0f, 1.18f)
                setPadding(0, dp(7), 0, 0)
            })
        }
        root.addView(guideCard, fullWidthParams())

        setContentView(scroll)
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
        overlayStatusText.text = buildString {
            if (entry?.memo?.isNotBlank() == true) {
                append("메모: ${entry.memo.take(80)}")
            } else {
                append("목적지를 받으면 주소와 메모가 여기에 표시됩니다.")
            }
        }
    }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(17), dp(16), dp(17), dp(17))
        background = rounded(Color.WHITE, 19f, CARD_BORDER, 1)
        elevation = dp(1).toFloat()
    }

    private fun menuRow(left: Button, right: Button): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(left, LinearLayout.LayoutParams(0, dp(94), 1f).apply { marginEnd = dp(4) })
        addView(right, LinearLayout.LayoutParams(0, dp(94), 1f).apply { marginStart = dp(4) })
    }

    private fun menuButton(title: String, subtitle: String, action: () -> Unit): Button = Button(this).apply {
        text = "$title\n$subtitle"
        isAllCaps = false
        textSize = 14f
        gravity = Gravity.CENTER
        setTextColor(TITLE_COLOR)
        background = rounded(Color.WHITE, 16f, CARD_BORDER, 1)
        setOnClickListener { action() }
    }

    private fun primaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
        this.text = text
        isAllCaps = false
        textSize = 15f
        setTextColor(Color.WHITE)
        background = rounded(ACCENT_COLOR, 13f)
        setOnClickListener { action() }
    }

    private fun rounded(
        color: Int,
        radiusDp: Float,
        strokeColor: Int? = null,
        strokeWidthDp: Int = 0,
    ): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
        if (strokeColor != null && strokeWidthDp > 0) setStroke(dp(strokeWidthDp), strokeColor)
    }

    private fun fullWidthParams(
        top: Int = 0,
        bottom: Int = 0,
    ): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply {
        topMargin = dp(top)
        bottomMargin = dp(bottom)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private val PAGE_BACKGROUND = Color.rgb(244, 246, 249)
        private val TITLE_COLOR = Color.rgb(26, 31, 40)
        private val SUBTITLE_COLOR = Color.rgb(101, 109, 122)
        private val CARD_BORDER = Color.rgb(228, 232, 238)
        private val ACCENT_COLOR = Color.rgb(54, 96, 226)
    }
}
