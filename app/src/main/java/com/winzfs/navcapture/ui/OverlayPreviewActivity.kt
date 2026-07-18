package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
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
            setBackgroundColor(Color.rgb(245, 246, 248))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(30))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "오버레이 샘플 테스트"
            textSize = 24f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(25, 29, 36))
        })
        root.addView(TextView(this).apply {
            text = "아래 내용을 실제 목적지 오버레이와 같은 포매터와 서비스로 표시합니다. 테스트 값은 최근 목적지와 주소별 메모장에 저장되지 않습니다."
            textSize = 14f
            setTextColor(Color.rgb(80, 86, 96))
            setPadding(0, dp(8), 0, dp(16))
        })

        addressInput = input(
            root = root,
            label = "주소",
            value = preferences.getString(KEY_ADDRESS, DEFAULT_ADDRESS).orEmpty(),
            hint = "예: 광주광역시 광산구 수완로24번길 84",
        )
        buildingInput = input(
            root = root,
            label = "건물명",
            value = preferences.getString(KEY_BUILDING, DEFAULT_BUILDING).orEmpty(),
            hint = "예: 수완대방노블랜드",
        )
        unitInput = input(
            root = root,
            label = "동·층·호수",
            value = preferences.getString(KEY_UNIT, DEFAULT_UNIT).orEmpty(),
            hint = "예: 105동 12층 1203호",
        )
        memoInput = input(
            root = root,
            label = "개인 메모",
            value = preferences.getString(KEY_MEMO, DEFAULT_MEMO).orEmpty(),
            hint = "예: 후문 주차장 쪽으로 진입",
            minLines = 3,
        )

        root.addView(Button(this).apply {
            text = "샘플 오버레이 표시 · 업데이트"
            isAllCaps = false
            setOnClickListener { showPreview() }
        }, marginParams(top = 12, bottom = 6))

        root.addView(Button(this).apply {
            text = "기본 샘플 다시 불러오기"
            isAllCaps = false
            setOnClickListener {
                addressInput.setText(DEFAULT_ADDRESS)
                buildingInput.setText(DEFAULT_BUILDING)
                unitInput.setText(DEFAULT_UNIT)
                memoInput.setText(DEFAULT_MEMO)
            }
        }, marginParams(bottom = 6))

        root.addView(Button(this).apply {
            text = "현재 오버레이 닫기"
            isAllCaps = false
            setOnClickListener { DestinationOverlayService.hide(this@OverlayPreviewActivity) }
        }, marginParams(bottom = 12))

        root.addView(TextView(this).apply {
            text = "샘플 오버레이가 떠 있는 상태에서 RiderApp 메인 화면의 가로·세로 크기 버튼을 누르면 실제처럼 즉시 크기가 변경됩니다."
            textSize = 13f
            setTextColor(Color.rgb(90, 97, 108))
            setPadding(dp(4), dp(8), dp(4), 0)
        })

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
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(38, 43, 52))
            setPadding(dp(2), dp(12), dp(2), dp(5))
        })
        return EditText(this).apply {
            setText(value)
            this.hint = hint
            textSize = 15f
            gravity = Gravity.TOP or Gravity.START
            this.minLines = minLines
            maxLines = if (minLines > 1) 6 else 2
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setBackgroundColor(Color.WHITE)
            root.addView(
                this,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
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

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

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
