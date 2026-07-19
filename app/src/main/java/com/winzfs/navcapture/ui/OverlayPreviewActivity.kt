package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.overlay.OverlayStyleSettings

class OverlayPreviewActivity : Activity() {
    private lateinit var addressInput: EditText
    private lateinit var buildingInput: EditText
    private lateinit var unitInput: EditText
    private lateinit var memoInput: EditText
    private lateinit var styleSummary: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        renderStyleSummary()
    }

    private fun buildUi() {
        val preferences = getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE)
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "샘플 오버레이",
                subtitleText = "실제 목적지와 같은 포매터와 오버레이 서비스로 확인합니다.",
            ),
        )

        val styleCard = RiderUi.card(this, "현재 스타일")
        styleSummary = TextView(this).apply {
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.15f)
            setPadding(0, RiderUi.dp(this@OverlayPreviewActivity, 8), 0, 0)
        }
        styleCard.addView(styleSummary)
        styleCard.addView(
            RiderUi.secondaryButton(this, "크기·색상·투명도 설정 열기") {
                startActivity(Intent(this, AppSettingsActivity::class.java))
            },
            RiderUi.fullWidth(this, top = 11, heightDp = 44),
        )
        root.addView(styleCard, RiderUi.fullWidth(this, bottom = 12))

        val inputCard = RiderUi.card(
            context = this,
            titleText = "샘플 내용",
            subtitleText = "입력값은 최근 목적지와 주소 메모에 저장되지 않습니다.",
        )
        addressInput = addInput(
            inputCard,
            "주소",
            preferences.getString(KEY_ADDRESS, DEFAULT_ADDRESS).orEmpty(),
            "광주광역시 광산구 수완로24번길 84",
        )
        buildingInput = addInput(
            inputCard,
            "건물명",
            preferences.getString(KEY_BUILDING, DEFAULT_BUILDING).orEmpty(),
            "수완대방노블랜드",
        )
        unitInput = addInput(
            inputCard,
            "동·층·호수",
            preferences.getString(KEY_UNIT, DEFAULT_UNIT).orEmpty(),
            "105동 12층 1203호",
        )
        memoInput = addInput(
            inputCard,
            "개인 메모",
            preferences.getString(KEY_MEMO, DEFAULT_MEMO).orEmpty(),
            "후문 주차장 쪽으로 진입",
            multiline = true,
        )
        root.addView(inputCard, RiderUi.fullWidth(this, bottom = 12))

        root.addView(
            RiderUi.primaryButton(this, "샘플 오버레이 표시 · 업데이트") {
                showPreview()
            },
            RiderUi.fullWidth(this, bottom = 8, heightDp = 50),
        )

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(
                RiderUi.secondaryButton(this@OverlayPreviewActivity, "기본 샘플") {
                    addressInput.setText(DEFAULT_ADDRESS)
                    buildingInput.setText(DEFAULT_BUILDING)
                    unitInput.setText(DEFAULT_UNIT)
                    memoInput.setText(DEFAULT_MEMO)
                },
                RiderUi.weighted(this@OverlayPreviewActivity, end = 4, heightDp = 46),
            )
            addView(
                RiderUi.secondaryButton(this@OverlayPreviewActivity, "오버레이 닫기") {
                    DestinationOverlayService.hide(this@OverlayPreviewActivity)
                },
                RiderUi.weighted(this@OverlayPreviewActivity, start = 4, heightDp = 46),
            )
        }
        root.addView(actions, RiderUi.fullWidth(this))

        setContentView(page.scroll)
    }

    private fun addInput(
        parent: LinearLayout,
        label: String,
        value: String,
        hint: String,
        multiline: Boolean = false,
    ): EditText {
        parent.addView(
            RiderUi.sectionLabel(this, label),
            RiderUi.fullWidth(this, top = if (label == "주소") 10 else 8),
        )
        return RiderUi.input(this, hint, multiline).apply {
            setText(value)
            if (multiline) gravity = Gravity.TOP or Gravity.START
            parent.addView(this, RiderUi.fullWidth(this@OverlayPreviewActivity))
        }
    }

    private fun renderStyleSummary() {
        if (!::styleSummary.isInitialized) return
        val style = OverlayStyleSettings.load(this)
        styleSummary.text = buildString {
            append("배경 ${style.backgroundOpacityPercent}%")
            append("  ·  글자 ${style.textOpacityPercent}%")
            append("  ·  글자 윤곽선 ${style.textOutlineWidthDp}dp")
            if (style.backgroundOpacityPercent == 0 && style.textOpacityPercent == 100) {
                append("\n배경은 완전히 투명하고 글자는 선명하게 표시됩니다.")
            }
        }
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

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

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
    }
}
