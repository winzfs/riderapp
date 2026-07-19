package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.navigation.NavApp
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.overlay.OverlaySize
import com.winzfs.navcapture.overlay.OverlaySizePolicy
import com.winzfs.navcapture.overlay.OverlayStyle
import com.winzfs.navcapture.overlay.OverlayStyleSettings

class AppSettingsActivity : Activity() {
    private lateinit var overlayPermissionButton: Button
    private lateinit var sizeValueText: TextView
    private lateinit var backgroundOpacityText: TextView
    private lateinit var outlineValueText: TextView
    private lateinit var backgroundColorField: ColorField
    private lateinit var primaryColorField: ColorField
    private lateinit var secondaryColorField: ColorField
    private lateinit var accentColorField: ColorField
    private lateinit var outlineColorField: ColorField

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionButton()
        renderSize()
        renderStyle(OverlayStyleSettings.load(this))
    }

    private fun buildUi() {
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
            text = "설정"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(TITLE_COLOR)
        })
        root.addView(TextView(this).apply {
            text = "오버레이 모양과 내비 연결을 필요한 만큼만 조절합니다."
            textSize = 14f
            setTextColor(SUBTITLE_COLOR)
            setPadding(0, dp(6), 0, dp(16))
        })

        root.addView(buildOverlayCard(), cardParams())
        root.addView(buildSizeCard(), cardParams())
        root.addView(buildAppearanceCard(), cardParams())
        root.addView(buildNavigationCard(), cardParams())

        root.addView(Button(this).apply {
            text = "샘플 주소로 실제 오버레이 테스트"
            isAllCaps = false
            textSize = 15f
            setTextColor(Color.WHITE)
            background = rounded(ACCENT_COLOR, 14f)
            setPadding(dp(12), dp(13), dp(12), dp(13))
            setOnClickListener {
                startActivity(Intent(this@AppSettingsActivity, OverlayPreviewActivity::class.java))
            }
        }, fullWidthParams(top = 4))

        setContentView(scroll)
    }

    private fun buildOverlayCard(): LinearLayout = card("오버레이 표시", "주소와 메모 창의 사용 여부를 관리합니다.").apply {
        val overlaySwitch = Switch(this@AppSettingsActivity).apply {
            text = "다른 앱 위에 목적지 오버레이 표시"
            textSize = 15f
            isChecked = settings().getBoolean(KEY_OVERLAY_ENABLED, true)
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_OVERLAY_ENABLED, checked).apply()
                if (!checked) {
                    DestinationOverlayService.hide(this@AppSettingsActivity)
                } else if (!Settings.canDrawOverlays(this@AppSettingsActivity)) {
                    toast("오버레이 권한을 먼저 허용해 주세요.")
                }
            }
        }
        addView(overlaySwitch, fullWidthParams(top = 8))

        overlayPermissionButton = secondaryButton("") { openOverlayPermissionSettings() }
        addView(overlayPermissionButton, fullWidthParams(top = 8))
        addView(secondaryButton("현재 오버레이 닫기") {
            DestinationOverlayService.hide(this@AppSettingsActivity)
        }, fullWidthParams(top = 6))
    }

    private fun buildSizeCard(): LinearLayout = card("크기", "가로와 세로를 10dp 단위로 조절합니다.").apply {
        sizeValueText = valueBox("")
        addView(sizeValueText, fullWidthParams(top = 9))
        addView(
            pairedButtons(
                "가로 −",
                { adjustSize(-OverlaySizePolicy.WIDTH_STEP_DP, 0) },
                "가로 +",
                { adjustSize(OverlaySizePolicy.WIDTH_STEP_DP, 0) },
            ),
            fullWidthParams(top = 8),
        )
        addView(
            pairedButtons(
                "세로 −",
                { adjustSize(0, -OverlaySizePolicy.HEIGHT_STEP_DP) },
                "세로 +",
                { adjustSize(0, OverlaySizePolicy.HEIGHT_STEP_DP) },
            ),
            fullWidthParams(top = 6),
        )
        addView(secondaryButton("기본 크기로 되돌리기") {
            renderSize(DestinationOverlayService.resetSize(this@AppSettingsActivity))
        }, fullWidthParams(top = 6))
    }

    private fun buildAppearanceCard(): LinearLayout = card(
        "오버레이 스타일",
        "투명도, 글자색과 윤곽선을 세부적으로 조절합니다.",
    ).apply {
        backgroundOpacityText = valueBox("")
        addView(backgroundOpacityText, fullWidthParams(top = 9))
        addView(
            pairedButtons(
                "배경 더 투명",
                { adjustBackgroundOpacity(-OverlayStyleSettings.OPACITY_STEP_PERCENT) },
                "배경 더 진하게",
                { adjustBackgroundOpacity(OverlayStyleSettings.OPACITY_STEP_PERCENT) },
            ),
            fullWidthParams(top = 7),
        )

        addView(miniTitle("색상"), fullWidthParams(top = 14))
        backgroundColorField = colorField(this@AppSettingsActivity, "배경색", "#1B1F27")
        primaryColorField = colorField(this@AppSettingsActivity, "주소 글자색", "#FFFFFF")
        secondaryColorField = colorField(this@AppSettingsActivity, "건물·메모 글자색", "#DEE5EF")
        accentColorField = colorField(this@AppSettingsActivity, "동·호수 강조색", "#FFDC8E")
        outlineColorField = colorField(this@AppSettingsActivity, "윤곽선 색", "#FFFFFF")
        listOf(
            backgroundColorField,
            primaryColorField,
            secondaryColorField,
            accentColorField,
            outlineColorField,
        ).forEach { addView(it.root, fullWidthParams(top = 6)) }

        addView(primaryButton("색상 적용") { applyColors() }, fullWidthParams(top = 10))

        addView(miniTitle("윤곽선"), fullWidthParams(top = 15))
        outlineValueText = valueBox("")
        addView(outlineValueText, fullWidthParams(top = 5))
        addView(
            pairedButtons(
                "두께 −",
                { adjustOutlineWidth(-OverlayStyleSettings.OUTLINE_WIDTH_STEP_DP) },
                "두께 +",
                { adjustOutlineWidth(OverlayStyleSettings.OUTLINE_WIDTH_STEP_DP) },
            ),
            fullWidthParams(top = 7),
        )
        addView(
            pairedButtons(
                "윤곽선 더 투명",
                { adjustOutlineOpacity(-OverlayStyleSettings.OUTLINE_OPACITY_STEP_PERCENT) },
                "윤곽선 더 진하게",
                { adjustOutlineOpacity(OverlayStyleSettings.OUTLINE_OPACITY_STEP_PERCENT) },
            ),
            fullWidthParams(top = 6),
        )
        addView(secondaryButton("스타일 기본값 복원") {
            val style = OverlayStyleSettings.reset(this@AppSettingsActivity)
            DestinationOverlayService.refreshStyle(this@AppSettingsActivity)
            renderStyle(style)
        }, fullWidthParams(top = 9))
    }

    private fun buildNavigationCard(): LinearLayout = card("내비 연결", "목적지를 받은 뒤 실행할 방식을 선택합니다.").apply {
        val autoForwardSwitch = Switch(this@AppSettingsActivity).apply {
            text = "목적지를 받으면 바로 지도 앱 실행"
            textSize = 15f
            isChecked = settings().getBoolean(KEY_AUTO_FORWARD, true)
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_AUTO_FORWARD, checked).apply()
            }
        }
        addView(autoForwardSwitch, fullWidthParams(top = 8))

        addView(TextView(this@AppSettingsActivity).apply {
            text = "기본 지도 앱"
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(SUBTITLE_COLOR)
            setPadding(dp(2), dp(10), dp(2), dp(5))
        })
        val navApps = NavApp.entries
        val spinner = Spinner(this@AppSettingsActivity).apply {
            adapter = ArrayAdapter(
                this@AppSettingsActivity,
                android.R.layout.simple_spinner_dropdown_item,
                navApps,
            )
            val savedApp = NavApp.fromStored(settings().getString(KEY_NAV_APP, null))
            setSelection(navApps.indexOf(savedApp).coerceAtLeast(0))
            onItemSelectedListener = SettingsItemSelectedListener { position ->
                settings().edit().putString(KEY_NAV_APP, navApps[position].name).apply()
            }
        }
        addView(spinner, fullWidthParams())
    }

    private fun adjustSize(widthDeltaDp: Int, heightDeltaDp: Int) {
        renderSize(
            DestinationOverlayService.adjustSize(
                context = this,
                widthDeltaDp = widthDeltaDp,
                heightDeltaDp = heightDeltaDp,
            ),
        )
    }

    private fun renderSize(size: OverlaySize = DestinationOverlayService.currentSize(this)) {
        if (!::sizeValueText.isInitialized) return
        sizeValueText.text = "가로 ${size.widthDp}dp   ·   세로 ${size.heightDp}dp"
    }

    private fun adjustBackgroundOpacity(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(backgroundOpacityPercent = current.backgroundOpacityPercent + delta))
    }

    private fun adjustOutlineOpacity(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(outlineOpacityPercent = current.outlineOpacityPercent + delta))
    }

    private fun adjustOutlineWidth(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(outlineWidthDp = current.outlineWidthDp + delta))
    }

    private fun saveStyle(style: OverlayStyle) {
        val saved = OverlayStyleSettings.save(this, style)
        DestinationOverlayService.refreshStyle(this)
        renderStyle(saved)
    }

    private fun applyColors() {
        val fields = listOf(
            "배경색" to backgroundColorField,
            "주소 글자색" to primaryColorField,
            "건물·메모 글자색" to secondaryColorField,
            "동·호수 강조색" to accentColorField,
            "윤곽선 색" to outlineColorField,
        )
        val parsed = mutableMapOf<String, Int>()
        for ((name, field) in fields) {
            val color = OverlayStyleSettings.parseHex(field.input.text.toString())
            if (color == null) {
                toast("$name 값을 #RRGGBB 형식으로 입력해 주세요.")
                field.input.requestFocus()
                return
            }
            parsed[name] = color
        }
        val current = OverlayStyleSettings.load(this)
        saveStyle(
            current.copy(
                backgroundColor = parsed.getValue("배경색"),
                primaryTextColor = parsed.getValue("주소 글자색"),
                secondaryTextColor = parsed.getValue("건물·메모 글자색"),
                accentTextColor = parsed.getValue("동·호수 강조색"),
                outlineColor = parsed.getValue("윤곽선 색"),
            ),
        )
        toast("오버레이 색상을 적용했습니다.")
    }

    private fun renderStyle(style: OverlayStyle) {
        if (!::backgroundOpacityText.isInitialized) return
        backgroundOpacityText.text = "배경 투명도 ${style.backgroundOpacityPercent}%"
        outlineValueText.text = "윤곽선 ${style.outlineWidthDp}dp   ·   투명도 ${style.outlineOpacityPercent}%"
        updateColorField(backgroundColorField, style.backgroundColor)
        updateColorField(primaryColorField, style.primaryTextColor)
        updateColorField(secondaryColorField, style.secondaryTextColor)
        updateColorField(accentColorField, style.accentTextColor)
        updateColorField(outlineColorField, style.outlineColor)
    }

    private fun updateColorField(field: ColorField, color: Int) {
        field.input.setText(OverlayStyleSettings.formatHex(color))
        field.swatch.background = rounded(0xFF000000.toInt() or color, 9f)
    }

    private fun openOverlayPermissionSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName"),
        )
        runCatching { startActivity(intent) }
            .onFailure { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)) }
    }

    private fun updatePermissionButton() {
        if (!::overlayPermissionButton.isInitialized) return
        overlayPermissionButton.text = if (Settings.canDrawOverlays(this)) {
            "오버레이 권한 허용됨 · 시스템 설정 열기"
        } else {
            "오버레이 권한 허용하기"
        }
    }

    private fun card(title: String, description: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(15), dp(16), dp(16))
        background = rounded(Color.WHITE, 18f, strokeColor = CARD_BORDER, strokeWidthDp = 1)
        elevation = dp(1).toFloat()
        addView(TextView(this@AppSettingsActivity).apply {
            text = title
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(TITLE_COLOR)
        })
        addView(TextView(this@AppSettingsActivity).apply {
            text = description
            textSize = 13f
            setTextColor(SUBTITLE_COLOR)
            setPadding(0, dp(4), 0, 0)
        })
    }

    private fun miniTitle(value: String): TextView = TextView(this).apply {
        text = value
        textSize = 14f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(TITLE_COLOR)
    }

    private fun valueBox(value: String): TextView = TextView(this).apply {
        text = value
        textSize = 14f
        gravity = Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(TITLE_COLOR)
        setPadding(dp(12), dp(12), dp(12), dp(12))
        background = rounded(VALUE_BACKGROUND, 12f)
    }

    private fun colorField(parent: Activity, label: String, value: String): ColorField {
        val root = LinearLayout(parent).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(11), dp(8), dp(8), dp(8))
            background = rounded(VALUE_BACKGROUND, 12f)
        }
        val labelText = TextView(parent).apply {
            text = label
            textSize = 13f
            setTextColor(TITLE_COLOR)
        }
        val input = EditText(parent).apply {
            setText(value)
            textSize = 14f
            isSingleLine = true
            filters = arrayOf(InputFilter.LengthFilter(7))
            gravity = Gravity.CENTER
            setPadding(dp(6), 0, dp(6), 0)
            background = null
        }
        val swatch = TextView(parent).apply {
            minWidth = dp(32)
            minHeight = dp(32)
            background = rounded(Color.DKGRAY, 9f)
        }
        root.addView(labelText, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(input, LinearLayout.LayoutParams(dp(96), dp(40)))
        root.addView(swatch, LinearLayout.LayoutParams(dp(32), dp(32)))
        return ColorField(root, input, swatch)
    }

    private fun pairedButtons(
        leftText: String,
        leftAction: () -> Unit,
        rightText: String,
        rightAction: () -> Unit,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(secondaryButton(leftText, leftAction), LinearLayout.LayoutParams(0, dp(46), 1f).apply {
            marginEnd = dp(4)
        })
        addView(secondaryButton(rightText, rightAction), LinearLayout.LayoutParams(0, dp(46), 1f).apply {
            marginStart = dp(4)
        })
    }

    private fun primaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
        this.text = text
        isAllCaps = false
        textSize = 14f
        setTextColor(Color.WHITE)
        background = rounded(ACCENT_COLOR, 12f)
        setOnClickListener { action() }
    }

    private fun secondaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
        this.text = text
        isAllCaps = false
        textSize = 14f
        setTextColor(TITLE_COLOR)
        background = rounded(VALUE_BACKGROUND, 12f, strokeColor = CARD_BORDER, strokeWidthDp = 1)
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

    private fun cardParams(): LinearLayout.LayoutParams = fullWidthParams(bottom = 12)

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

    private fun settings() = getSharedPreferences(SETTINGS_NAME, MODE_PRIVATE)

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()

    private data class ColorField(
        val root: LinearLayout,
        val input: EditText,
        val swatch: TextView,
    )

    companion object {
        private const val SETTINGS_NAME = "nav_capture_settings"
        private const val KEY_AUTO_FORWARD = "auto_forward"
        private const val KEY_NAV_APP = "nav_app"
        private const val KEY_OVERLAY_ENABLED = "overlay_enabled"

        private val PAGE_BACKGROUND = Color.rgb(244, 246, 249)
        private val TITLE_COLOR = Color.rgb(26, 31, 40)
        private val SUBTITLE_COLOR = Color.rgb(101, 109, 122)
        private val CARD_BORDER = Color.rgb(228, 232, 238)
        private val VALUE_BACKGROUND = Color.rgb(247, 249, 252)
        private val ACCENT_COLOR = Color.rgb(54, 96, 226)
    }
}

private class SettingsItemSelectedListener(
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
