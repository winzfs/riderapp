package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.overlay.DestinationOverlayService

class OverlayPreviewActivity : Activity() {
    private lateinit var addressInput: EditText
    private lateinit var buildingInput: EditText
    private lateinit var unitInput: EditText
    private lateinit var memoInput: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    private fun buildUi() {
        val preferences = getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE)
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(PAGE_BACKGROUND)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(20), dp(18), dp(34))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "샘플 오버레이"
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(TITLE_COLOR)
        })
        root.addView(TextView(this).apply {
            text = "실제 목적지와 같은 포매터와 오버레이 서비스로 확인합니다. 테스트 내용은 목적지 기록과 메모장에 저장되지 않습니다."
            textSize = 14f
            setTextColor(SUBTITLE_COLOR)
            setLineSpacing(0f, 1.14f)
            setPadding(0, dp(6), 0, dp(16))
        })

        val inputCard = card().apply {
            addView(TextView(this@OverlayPreviewActivity).apply {
                text = "표시할 내용"
                textSize = 18f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(TITLE_COLOR)
            })
            addressInput = input(
                root = this,
                label = "주소",
                value = preferences.getString(KEY_ADDRESS, DEFAULT_ADDRESS).orEmpty(),
                hint = "광주광역시 광산구 수완로24번길 84",
            )
            buildingInput = input(
                root = this,
                label = "건물명",
                value = preferences.getString(KEY_BUILDING, DEFAULT_BUILDING).orEmpty(),
                hint = "수완대방노블랜드",
            )
            unitInput = input(
                root = this,
                label = "동·층·호수",
                value = preferences.getString(KEY_UNIT, DEFAULT_UNIT).orEmpty(),
                hint = "105동 12층 1203호",
            )
            memoInput = input(
                root = this,
                label = "개인 메모",
                value = preferences.getString(KEY_MEMO, DEFAULT_MEMO).orEmpty(),
                hint = "후문 주차장 쪽으로 진입",
                minLines = 3,
            )
        }
        root.addView(inputCard, fullWidthParams(bottom = 12))

        root.addView(primaryButton("샘플 오버레이 표시 · 업데이트") { showPreview() }, fullWidthParams(bottom = 7))
        root.addView(secondaryButton("오버레이 스타일 설정 열기") {
            startActivity(Intent(this, AppSettingsActivity::class.java))
        }, fullWidthParams(bottom = 7))
        root.addView(
            pairedButtons(
                "기본 샘플",
                {
                    addressInput.setText(DEFAULT_ADDRESS)
                    buildingInput.setText(DEFAULT_BUILDING)
                    unitInput.setText(DEFAULT_UNIT)
                    memoInput.setText(DEFAULT_MEMO)
                },
                "오버레이 닫기",
                { DestinationOverlayService.hide(this) },
            ),
            fullWidthParams(bottom = 12),
        )

        val guide = card().apply {
            addView(TextView(this@OverlayPreviewActivity).apply {
                text = "테스트 팁"
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(TITLE_COLOR)
            })
            addView(TextView(this@OverlayPreviewActivity).apply {
                text = "샘플을 띄운 상태에서 설정 화면의 크기·투명도·색상·윤곽선을 바꾸면 실제 오버레이처럼 즉시 반영됩니다."
                textSize = 13f
                setTextColor(SUBTITLE_COLOR)
                setLineSpacing(0f, 1.14f)
                setPadding(0, dp(6), 0, 0)
            })
        }
        root.addView(guide, fullWidthParams())

        setContentView(scroll)
    }

    private fun showPreview() {
        val address = addressInput.text.toString().trim()
        if (address.isBlank()) {
            toast("샘플 주소를 입력해 주세요.")
            return
        }
        if (!Settings.canDrawOverlays(this)) {
            toast("먼저 오버레이 권한을 허용해 주세요.")
            val permissionIntent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName"),
            )
            runCatching { startActivity(permissionIntent) }
                .onFailure { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)) }
            return
        }

        val building = buildingInput.text.toString().trim()
        val unit = unitInput.text.toString().trim()
        val memo = memoInput.text.toString().trim()
        getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE).edit()
            .putString(KEY_ADDRESS, address)
            .putString(KEY_BUILDING, building)
            .putString(KEY_UNIT, unit)
            .putString(KEY_MEMO, memo)
            .apply()

        DestinationOverlayService.showPreview(
            context = this,
            address = address,
            buildingName = building,
            unitDetail = unit,
            memo = memo,
        )
        toast("실제 레이아웃으로 샘플 오버레이를 표시했습니다.")
    }

    private fun input(
        root: LinearLayout,
        label: String,
        value: String,
        hint: String,
        minLines: Int = 1,
    ): EditText {
        root.addView(TextView(this).apply {
            text = label
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(SUBTITLE_COLOR)
            setPadding(dp(2), dp(13), dp(2), dp(5))
        })
        return EditText(this).apply {
            setText(value)
            this.hint = hint
            textSize = 15f
            gravity = Gravity.TOP or Gravity.START
            this.minLines = minLines
            maxLines = if (minLines > 1) 6 else 2
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = rounded(VALUE_BACKGROUND, 12f, CARD_BORDER, 1)
            root.addView(this, fullWidthParams())
        }
    }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(15), dp(16), dp(16))
        background = rounded(Color.WHITE, 18f, CARD_BORDER, 1)
        elevation = dp(1).toFloat()
    }

    private fun pairedButtons(
        leftText: String,
        leftAction: () -> Unit,
        rightText: String,
        rightAction: () -> Unit,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(secondaryButton(leftText, leftAction), LinearLayout.LayoutParams(0, dp(48), 1f).apply {
            marginEnd = dp(4)
        })
        addView(secondaryButton(rightText, rightAction), LinearLayout.LayoutParams(0, dp(48), 1f).apply {
            marginStart = dp(4)
        })
    }

    private fun primaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
        this.text = text
        isAllCaps = false
        textSize = 15f
        setTextColor(Color.WHITE)
        background = rounded(ACCENT_COLOR, 13f)
        setOnClickListener { action() }
    }

    private fun secondaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
        this.text = text
        isAllCaps = false
        textSize = 14f
        setTextColor(TITLE_COLOR)
        background = rounded(Color.WHITE, 13f, CARD_BORDER, 1)
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

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val PREFERENCES_NAME = "overlay_preview_inputs"
        private const val KEY_ADDRESS = "address"
        private const val KEY_BUILDING = "building"
        private const val KEY_UNIT = "unit"
        private const val KEY_MEMO = "memo"

        private const val DEFAULT_ADDRESS = "광주광역시 광산구 수완로24번길 84"
        private const val DEFAULT_BUILDING = "수완대방노블랜드"
        private const val DEFAULT_UNIT = "105동 12층 1203호"
        private const val DEFAULT_MEMO = "후문 주차장 쪽으로 진입"

        private val PAGE_BACKGROUND = Color.rgb(244, 246, 249)
        private val TITLE_COLOR = Color.rgb(26, 31, 40)
        private val SUBTITLE_COLOR = Color.rgb(101, 109, 122)
        private val CARD_BORDER = Color.rgb(228, 232, 238)
        private val VALUE_BACKGROUND = Color.rgb(247, 249, 252)
        private val ACCENT_COLOR = Color.rgb(54, 96, 226)
    }
}
