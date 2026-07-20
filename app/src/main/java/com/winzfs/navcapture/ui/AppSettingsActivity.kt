package com.winzfs.navcapture.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.navigation.NavApp
import com.winzfs.navcapture.overlay.DestinationDisplayController
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.overlay.OverlayPresentationMode
import com.winzfs.navcapture.overlay.OverlayPresentationSettings
import com.winzfs.navcapture.overlay.OverlaySize
import com.winzfs.navcapture.overlay.OverlaySizePolicy
import com.winzfs.navcapture.overlay.OverlayStyle
import com.winzfs.navcapture.overlay.OverlayStyleSettings

class AppSettingsActivity : Activity() {
    private lateinit var overlayPermissionButton: Button
    private lateinit var notificationPermissionButton: Button
    private lateinit var widthValue: TextView
    private lateinit var heightValue: TextView
    private lateinit var backgroundOpacityValue: TextView
    private lateinit var textOpacityValue: TextView
    private lateinit var outlineWidthValue: TextView
    private lateinit var outlineOpacityValue: TextView
    private lateinit var addressTextSizeValue: TextView
    private lateinit var buildingTextSizeValue: TextView
    private lateinit var unitTextSizeValue: TextView
    private lateinit var memoTextSizeValue: TextView

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
        updatePermissionButtons()
        renderSize()
        renderStyle(OverlayStyleSettings.load(this))
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_NOTIFICATION_PERMISSION) {
            updatePermissionButtons()
            if (hasNotificationPermission()) {
                toast("알림 권한을 허용했습니다.")
                DestinationDisplayController.refreshPresentation(this)
            } else {
                toast("알림 권한이 없으면 상태표시줄과 알림창에 목적지가 보이지 않습니다.")
            }
        }
    }

    private fun buildUi() {
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "표시·알림 설정",
                subtitleText = "카드 오버레이와 실제 안드로이드 알림 중 하나를 선택합니다.",
            ),
        )

        root.addView(buildDisplayCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildPresentationCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildSizeCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildBackgroundCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildTypographyCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildTextAppearanceCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildTextOutlineCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(buildNavigationCard(), RiderUi.fullWidth(this, bottom = 12))
        root.addView(
            RiderUi.primaryButton(this, "샘플 주소로 현재 표시 방식 테스트") {
                startActivity(Intent(this, OverlayPreviewActivity::class.java))
            },
            RiderUi.fullWidth(this, heightDp = 50),
        )
        setContentView(page.scroll)
    }

    private fun buildDisplayCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "목적지 표시",
        subtitleText = "배달앱에서 목적지를 받았을 때 선택한 방식으로 표시합니다.",
    ).apply {
        addView(Switch(this@AppSettingsActivity).apply {
            text = "목적지 표시 사용"
            textSize = 15f
            isChecked = settings().getBoolean(KEY_DISPLAY_ENABLED, true)
            setPadding(0, RiderUi.dp(this@AppSettingsActivity, 7), 0, 0)
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_DISPLAY_ENABLED, checked).apply()
                if (checked) {
                    DestinationDisplayController.refreshPresentation(this@AppSettingsActivity)
                } else {
                    DestinationDisplayController.hide(this@AppSettingsActivity)
                }
            }
        }, RiderUi.fullWidth(this@AppSettingsActivity, top = 5))

        addView(
            RiderUi.secondaryButton(this@AppSettingsActivity, "현재 표시 닫기") {
                DestinationDisplayController.hide(this@AppSettingsActivity)
            },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 8, heightDp = 46),
        )
    }

    private fun buildPresentationCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "표시 방식",
        subtitleText = "상태표시줄에는 아이콘이 표시되고, 내용은 알림창에서 확인합니다.",
    ).apply {
        val presentation = OverlayPresentationSettings.load(this@AppSettingsActivity)
        val cardId = View.generateViewId()
        val notificationId = View.generateViewId()
        val modeGroup = RadioGroup(this@AppSettingsActivity).apply {
            orientation = RadioGroup.VERTICAL
        }
        modeGroup.addView(RadioButton(this@AppSettingsActivity).apply {
            id = cardId
            text = "카드형 오버레이 + 알림창"
            textSize = 15f
            setPadding(0, RiderUi.dp(this@AppSettingsActivity, 5), 0, RiderUi.dp(this@AppSettingsActivity, 3))
        })
        modeGroup.addView(RadioButton(this@AppSettingsActivity).apply {
            id = notificationId
            text = "시스템 알림 전용"
            textSize = 15f
            setPadding(0, RiderUi.dp(this@AppSettingsActivity, 3), 0, RiderUi.dp(this@AppSettingsActivity, 5))
        })
        modeGroup.check(
            if (presentation.mode == OverlayPresentationMode.TOP_TICKER) notificationId else cardId,
        )
        modeGroup.setOnCheckedChangeListener { _, checkedId ->
            val mode = if (checkedId == notificationId) {
                OverlayPresentationMode.TOP_TICKER
            } else {
                OverlayPresentationMode.CARD
            }
            OverlayPresentationSettings.setMode(this@AppSettingsActivity, mode)
            if (mode == OverlayPresentationMode.TOP_TICKER) {
                requestNotificationPermissionIfNeeded()
            } else if (!Settings.canDrawOverlays(this@AppSettingsActivity)) {
                toast("카드형 오버레이에는 다른 앱 위 표시 권한이 필요합니다.")
            }
            DestinationDisplayController.refreshPresentation(this@AppSettingsActivity)
        }
        addView(modeGroup, RiderUi.fullWidth(this@AppSettingsActivity, top = 8))

        addView(TextView(this@AppSettingsActivity).apply {
            text = "시스템 알림 전용은 화면 위에 별도 창을 띄우지 않습니다. 상태표시줄에는 RiderApp 아이콘이 유지되고, 알림창을 내리면 주소·건물명·동호수·메모를 볼 수 있습니다."
            textSize = 12.5f
            setTextColor(RiderUi.muted)
            setLineSpacing(0f, 1.12f)
            setPadding(0, RiderUi.dp(this@AppSettingsActivity, 5), 0, RiderUi.dp(this@AppSettingsActivity, 8))
        }, RiderUi.fullWidth(this@AppSettingsActivity))

        addView(Switch(this@AppSettingsActivity).apply {
            text = "알림창에 주소·동호수·메모 상세 표시"
            textSize = 15f
            isChecked = presentation.showDetailedNotification
            setOnCheckedChangeListener { _, checked ->
                OverlayPresentationSettings.setDetailedNotification(
                    this@AppSettingsActivity,
                    checked,
                )
                if (checked) requestNotificationPermissionIfNeeded()
                DestinationDisplayController.refreshPresentation(this@AppSettingsActivity)
            }
        }, RiderUi.fullWidth(this@AppSettingsActivity, top = 4))

        addView(Switch(this@AppSettingsActivity).apply {
            text = "새 목적지 수신 시 시스템 상단 알림"
            textSize = 15f
            isChecked = presentation.showHeadsUpNotification
            setOnCheckedChangeListener { _, checked ->
                OverlayPresentationSettings.setHeadsUpNotification(
                    this@AppSettingsActivity,
                    checked,
                )
                if (checked) requestNotificationPermissionIfNeeded()
            }
        }, RiderUi.fullWidth(this@AppSettingsActivity, top = 4))

        addView(TextView(this@AppSettingsActivity).apply {
            text = "상단 알림은 새 목적지를 받을 때 안드로이드 시스템이 잠시 보여주는 헤드업 배너입니다. 기기 알림 설정에 따라 팝업이 제한될 수 있습니다."
            textSize = 12.5f
            setTextColor(RiderUi.muted)
            setLineSpacing(0f, 1.12f)
            setPadding(0, RiderUi.dp(this@AppSettingsActivity, 4), 0, 0)
        }, RiderUi.fullWidth(this@AppSettingsActivity))

        notificationPermissionButton = RiderUi.secondaryButton(this@AppSettingsActivity, "") {
            if (hasNotificationPermission()) {
                openNotificationSettings()
            } else {
                requestNotificationPermissionIfNeeded()
            }
        }
        addView(
            notificationPermissionButton,
            RiderUi.fullWidth(this@AppSettingsActivity, top = 10, heightDp = 46),
        )

        overlayPermissionButton = RiderUi.secondaryButton(this@AppSettingsActivity, "") {
            openOverlayPermissionSettings()
        }
        addView(
            overlayPermissionButton,
            RiderUi.fullWidth(this@AppSettingsActivity, top = 7, heightDp = 46),
        )
    }

    private fun buildSizeCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "카드 창 크기",
        subtitleText = "카드형 오버레이에서만 적용됩니다. 가로와 세로를 10dp 단위로 조절합니다.",
    ).apply {
        widthValue = RiderUi.valueBox(this@AppSettingsActivity)
        heightValue = RiderUi.valueBox(this@AppSettingsActivity)
        addView(
            stepper(
                "가로",
                widthValue,
                { adjustSize(-OverlaySizePolicy.WIDTH_STEP_DP, 0) },
                { adjustSize(OverlaySizePolicy.WIDTH_STEP_DP, 0) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 11),
        )
        addView(
            stepper(
                "세로",
                heightValue,
                { adjustSize(0, -OverlaySizePolicy.HEIGHT_STEP_DP) },
                { adjustSize(0, OverlaySizePolicy.HEIGHT_STEP_DP) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 7),
        )
        addView(
            RiderUi.secondaryButton(this@AppSettingsActivity, "기본 창 크기로 복원") {
                renderSize(DestinationOverlayService.resetSize(this@AppSettingsActivity))
            },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 9, heightDp = 44),
        )
    }

    private fun buildBackgroundCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "카드 배경",
        subtitleText = "카드형 오버레이에서만 적용되며 글자 선명도와 독립적으로 조절됩니다.",
    ).apply {
        backgroundOpacityValue = RiderUi.valueBox(this@AppSettingsActivity)
        addView(
            stepper(
                "배경 투명도",
                backgroundOpacityValue,
                { adjustBackgroundOpacity(-OverlayStyleSettings.OPACITY_STEP_PERCENT) },
                { adjustBackgroundOpacity(OverlayStyleSettings.OPACITY_STEP_PERCENT) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 11),
        )
        addView(
            presetRow(
                "완전 투명" to { setBackgroundOpacity(0) },
                "반투명" to { setBackgroundOpacity(45) },
                "진하게" to { setBackgroundOpacity(85) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 8),
        )

        backgroundColorField = colorField("배경색")
        addView(backgroundColorField.root, RiderUi.fullWidth(this@AppSettingsActivity, top = 13))
        addView(
            RiderUi.secondaryButton(this@AppSettingsActivity, "배경색 적용") {
                val color = requireColor("배경색", backgroundColorField) ?: return@secondaryButton
                saveStyle(OverlayStyleSettings.load(this@AppSettingsActivity).copy(backgroundColor = color))
            },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 8, heightDp = 44),
        )
        addView(
            RiderUi.primaryButton(this@AppSettingsActivity, "배경만 투명하게 · 글자 100%") {
                val current = OverlayStyleSettings.load(this@AppSettingsActivity)
                saveStyle(current.copy(backgroundOpacityPercent = 0, textOpacityPercent = 100))
            },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 10, heightDp = 46),
        )
    }

    private fun buildTypographyCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "카드 글자 크기",
        subtitleText = "각 정보의 글자 크기를 1sp 단위로 조절합니다.",
    ).apply {
        addressTextSizeValue = RiderUi.valueBox(this@AppSettingsActivity)
        buildingTextSizeValue = RiderUi.valueBox(this@AppSettingsActivity)
        unitTextSizeValue = RiderUi.valueBox(this@AppSettingsActivity)
        memoTextSizeValue = RiderUi.valueBox(this@AppSettingsActivity)

        addView(fontSizeStepper("주소", addressTextSizeValue, FontTarget.ADDRESS), RiderUi.fullWidth(this@AppSettingsActivity, top = 11))
        addView(fontSizeStepper("건물명", buildingTextSizeValue, FontTarget.BUILDING), RiderUi.fullWidth(this@AppSettingsActivity, top = 7))
        addView(fontSizeStepper("동·호수", unitTextSizeValue, FontTarget.UNIT), RiderUi.fullWidth(this@AppSettingsActivity, top = 7))
        addView(fontSizeStepper("메모", memoTextSizeValue, FontTarget.MEMO), RiderUi.fullWidth(this@AppSettingsActivity, top = 7))
        addView(
            RiderUi.secondaryButton(this@AppSettingsActivity, "기본 글자 크기로 복원") {
                val style = OverlayStyleSettings.resetTextSizes(this@AppSettingsActivity)
                DestinationDisplayController.refreshStyle(this@AppSettingsActivity)
                renderStyle(style)
            },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 10, heightDp = 44),
        )
    }

    private fun buildTextAppearanceCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "카드 글자 색상",
        subtitleText = "글자 투명도와 항목별 색상을 배경과 별도로 조절합니다.",
    ).apply {
        textOpacityValue = RiderUi.valueBox(this@AppSettingsActivity)
        addView(
            stepper(
                "글자 선명도",
                textOpacityValue,
                { adjustTextOpacity(-OverlayStyleSettings.OPACITY_STEP_PERCENT) },
                { adjustTextOpacity(OverlayStyleSettings.OPACITY_STEP_PERCENT) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 11),
        )
        addView(
            presetRow(
                "60%" to { setTextOpacity(60) },
                "80%" to { setTextOpacity(80) },
                "선명 100%" to { setTextOpacity(100) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 8),
        )

        primaryColorField = colorField("주소 글자색")
        secondaryColorField = colorField("건물명·메모색")
        accentColorField = colorField("동·호수 강조색")
        listOf(primaryColorField, secondaryColorField, accentColorField).forEach {
            addView(it.root, RiderUi.fullWidth(this@AppSettingsActivity, top = 8))
        }
        addView(
            RiderUi.secondaryButton(this@AppSettingsActivity, "글자색 적용") { applyTextColors() },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 9, heightDp = 44),
        )
    }

    private fun buildTextOutlineCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "카드 글자 윤곽선",
        subtitleText = "카드형 오버레이에서만 적용됩니다. 0dp는 윤곽선 없음입니다.",
    ).apply {
        outlineWidthValue = RiderUi.valueBox(this@AppSettingsActivity)
        outlineOpacityValue = RiderUi.valueBox(this@AppSettingsActivity)
        addView(
            stepper(
                "윤곽선 두께",
                outlineWidthValue,
                { adjustTextOutlineWidth(-OverlayStyleSettings.TEXT_OUTLINE_WIDTH_STEP_DP) },
                { adjustTextOutlineWidth(OverlayStyleSettings.TEXT_OUTLINE_WIDTH_STEP_DP) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 11),
        )
        addView(
            stepper(
                "윤곽선 선명도",
                outlineOpacityValue,
                { adjustTextOutlineOpacity(-OverlayStyleSettings.TEXT_OUTLINE_OPACITY_STEP_PERCENT) },
                { adjustTextOutlineOpacity(OverlayStyleSettings.TEXT_OUTLINE_OPACITY_STEP_PERCENT) },
            ),
            RiderUi.fullWidth(this@AppSettingsActivity, top = 7),
        )

        outlineColorField = colorField("윤곽선 색")
        addView(outlineColorField.root, RiderUi.fullWidth(this@AppSettingsActivity, top = 10))
        addView(
            RiderUi.secondaryButton(this@AppSettingsActivity, "윤곽선 색 적용") {
                val color = requireColor("윤곽선 색", outlineColorField) ?: return@secondaryButton
                saveStyle(OverlayStyleSettings.load(this@AppSettingsActivity).copy(textOutlineColor = color))
            },
            RiderUi.fullWidth(this@AppSettingsActivity, top = 8, heightDp = 44),
        )
    }

    private fun buildNavigationCard(): LinearLayout = RiderUi.card(
        context = this,
        titleText = "내비 연결",
        subtitleText = "배달앱에서 목적지를 받은 뒤 실행할 방식을 선택합니다.",
    ).apply {
        addView(Switch(this@AppSettingsActivity).apply {
            text = "목적지를 받으면 바로 지도 앱 실행"
            textSize = 15f
            isChecked = settings().getBoolean(KEY_AUTO_FORWARD, true)
            setPadding(0, RiderUi.dp(this@AppSettingsActivity, 7), 0, 0)
            setOnCheckedChangeListener { _, checked ->
                settings().edit().putBoolean(KEY_AUTO_FORWARD, checked).apply()
            }
        }, RiderUi.fullWidth(this@AppSettingsActivity, top = 4))

        addView(RiderUi.sectionLabel(this@AppSettingsActivity, "기본 지도 앱"), RiderUi.fullWidth(this@AppSettingsActivity, top = 8))
        val navApps = NavApp.entries
        addView(Spinner(this@AppSettingsActivity).apply {
            adapter = ArrayAdapter(
                this@AppSettingsActivity,
                android.R.layout.simple_spinner_dropdown_item,
                navApps,
            )
            val savedApp = NavApp.fromStored(settings().getString(KEY_NAV_APP, null))
            setSelection(navApps.indexOf(savedApp).coerceAtLeast(0))
            background = RiderUi.rounded(RiderUi.soft, 12f, RiderUi.border, 1, this@AppSettingsActivity)
            setPadding(RiderUi.dp(this@AppSettingsActivity, 12), 0, RiderUi.dp(this@AppSettingsActivity, 12), 0)
            onItemSelectedListener = SettingsItemSelectedListener { position ->
                settings().edit().putString(KEY_NAV_APP, navApps[position].name).apply()
            }
        }, RiderUi.fullWidth(this@AppSettingsActivity, heightDp = 48))
    }

    private fun fontSizeStepper(
        label: String,
        valueView: TextView,
        target: FontTarget,
    ): LinearLayout = stepper(
        label = label,
        valueView = valueView,
        minus = { adjustFontSize(target, -OverlayStyleSettings.TEXT_SIZE_STEP_SP) },
        plus = { adjustFontSize(target, OverlayStyleSettings.TEXT_SIZE_STEP_SP) },
    )

    private fun stepper(
        label: String,
        valueView: TextView,
        minus: () -> Unit,
        plus: () -> Unit,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(TextView(this@AppSettingsActivity).apply {
            text = label
            textSize = 14f
            setTextColor(RiderUi.body)
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        addView(
            RiderUi.smallButton(this@AppSettingsActivity, "−", minus),
            LinearLayout.LayoutParams(
                RiderUi.dp(this@AppSettingsActivity, 43),
                RiderUi.dp(this@AppSettingsActivity, 42),
            ),
        )
        addView(
            valueView,
            LinearLayout.LayoutParams(
                RiderUi.dp(this@AppSettingsActivity, 84),
                RiderUi.dp(this@AppSettingsActivity, 42),
            ).apply {
                marginStart = RiderUi.dp(this@AppSettingsActivity, 5)
                marginEnd = RiderUi.dp(this@AppSettingsActivity, 5)
            },
        )
        addView(
            RiderUi.smallButton(this@AppSettingsActivity, "+", plus),
            LinearLayout.LayoutParams(
                RiderUi.dp(this@AppSettingsActivity, 43),
                RiderUi.dp(this@AppSettingsActivity, 42),
            ),
        )
    }

    private fun presetRow(vararg presets: Pair<String, () -> Unit>): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            presets.forEachIndexed { index, (label, action) ->
                addView(
                    RiderUi.smallButton(this@AppSettingsActivity, label, action),
                    LinearLayout.LayoutParams(
                        0,
                        RiderUi.dp(this@AppSettingsActivity, 40),
                        1f,
                    ).apply {
                        if (index > 0) marginStart = RiderUi.dp(this@AppSettingsActivity, 5)
                    },
                )
            }
        }

    private fun colorField(label: String): ColorField {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(
                RiderUi.dp(this@AppSettingsActivity, 12),
                RiderUi.dp(this@AppSettingsActivity, 7),
                RiderUi.dp(this@AppSettingsActivity, 8),
                RiderUi.dp(this@AppSettingsActivity, 7),
            )
            background = RiderUi.rounded(
                RiderUi.soft,
                12f,
                RiderUi.border,
                1,
                this@AppSettingsActivity,
            )
        }
        root.addView(TextView(this).apply {
            text = label
            textSize = 13f
            setTextColor(RiderUi.body)
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val input = EditText(this).apply {
            textSize = 14f
            isSingleLine = true
            gravity = Gravity.CENTER
            filters = arrayOf(InputFilter.LengthFilter(7))
            background = null
            setPadding(3, 0, 3, 0)
        }
        val swatch = TextView(this).apply {
            minWidth = RiderUi.dp(this@AppSettingsActivity, 31)
            minHeight = RiderUi.dp(this@AppSettingsActivity, 31)
        }
        root.addView(
            input,
            LinearLayout.LayoutParams(
                RiderUi.dp(this@AppSettingsActivity, 92),
                RiderUi.dp(this@AppSettingsActivity, 39),
            ),
        )
        root.addView(
            swatch,
            LinearLayout.LayoutParams(
                RiderUi.dp(this@AppSettingsActivity, 31),
                RiderUi.dp(this@AppSettingsActivity, 31),
            ),
        )
        return ColorField(root, input, swatch)
    }

    private fun adjustSize(widthDeltaDp: Int, heightDeltaDp: Int) {
        renderSize(DestinationOverlayService.adjustSize(this, widthDeltaDp, heightDeltaDp))
    }

    private fun renderSize(size: OverlaySize = DestinationOverlayService.currentSize(this)) {
        if (!::widthValue.isInitialized) return
        widthValue.text = "${size.widthDp}dp"
        heightValue.text = "${size.heightDp}dp"
    }

    private fun adjustFontSize(target: FontTarget, delta: Int) {
        val current = OverlayStyleSettings.load(this)
        val changed = when (target) {
            FontTarget.ADDRESS -> current.copy(addressTextSizeSp = current.addressTextSizeSp + delta)
            FontTarget.BUILDING -> current.copy(buildingTextSizeSp = current.buildingTextSizeSp + delta)
            FontTarget.UNIT -> current.copy(unitTextSizeSp = current.unitTextSizeSp + delta)
            FontTarget.MEMO -> current.copy(memoTextSizeSp = current.memoTextSizeSp + delta)
        }
        saveStyle(changed)
    }

    private fun adjustBackgroundOpacity(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(backgroundOpacityPercent = current.backgroundOpacityPercent + delta))
    }

    private fun setBackgroundOpacity(value: Int) {
        saveStyle(OverlayStyleSettings.load(this).copy(backgroundOpacityPercent = value))
    }

    private fun adjustTextOpacity(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(textOpacityPercent = current.textOpacityPercent + delta))
    }

    private fun setTextOpacity(value: Int) {
        saveStyle(OverlayStyleSettings.load(this).copy(textOpacityPercent = value))
    }

    private fun adjustTextOutlineOpacity(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(textOutlineOpacityPercent = current.textOutlineOpacityPercent + delta))
    }

    private fun adjustTextOutlineWidth(delta: Int) {
        val current = OverlayStyleSettings.load(this)
        saveStyle(current.copy(textOutlineWidthDp = current.textOutlineWidthDp + delta))
    }

    private fun saveStyle(style: OverlayStyle) {
        val saved = OverlayStyleSettings.save(this, style)
        DestinationDisplayController.refreshStyle(this)
        renderStyle(saved)
    }

    private fun applyTextColors() {
        val primary = requireColor("주소 글자색", primaryColorField) ?: return
        val secondary = requireColor("건물명·메모색", secondaryColorField) ?: return
        val accent = requireColor("동·호수 강조색", accentColorField) ?: return
        saveStyle(
            OverlayStyleSettings.load(this).copy(
                primaryTextColor = primary,
                secondaryTextColor = secondary,
                accentTextColor = accent,
            ),
        )
    }

    private fun requireColor(name: String, field: ColorField): Int? {
        val parsed = OverlayStyleSettings.parseHex(field.input.text.toString())
        if (parsed == null) {
            toast("$name 값을 #RRGGBB 형식으로 입력해 주세요.")
            field.input.requestFocus()
        }
        return parsed
    }

    private fun renderStyle(style: OverlayStyle) {
        if (!::backgroundOpacityValue.isInitialized) return
        backgroundOpacityValue.text = "${style.backgroundOpacityPercent}%"
        textOpacityValue.text = "${style.textOpacityPercent}%"
        outlineWidthValue.text = "${style.textOutlineWidthDp}dp"
        outlineOpacityValue.text = "${style.textOutlineOpacityPercent}%"
        addressTextSizeValue.text = "${style.addressTextSizeSp}sp"
        buildingTextSizeValue.text = "${style.buildingTextSizeSp}sp"
        unitTextSizeValue.text = "${style.unitTextSizeSp}sp"
        memoTextSizeValue.text = "${style.memoTextSizeSp}sp"
        updateColorField(backgroundColorField, style.backgroundColor)
        updateColorField(primaryColorField, style.primaryTextColor)
        updateColorField(secondaryColorField, style.secondaryTextColor)
        updateColorField(accentColorField, style.accentTextColor)
        updateColorField(outlineColorField, style.textOutlineColor)
    }

    private fun updateColorField(field: ColorField, color: Int) {
        field.input.setText(OverlayStyleSettings.formatHex(color))
        field.swatch.background = RiderUi.rounded(
            0xFF000000.toInt() or color,
            9f,
            RiderUi.border,
            1,
            this,
        )
    }

    private fun openOverlayPermissionSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName"),
        )
        runCatching { startActivity(intent) }
            .onFailure { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)) }
    }

    private fun hasNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun requestNotificationPermissionIfNeeded() {
        if (hasNotificationPermission()) return
        requestPermissions(
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            REQUEST_NOTIFICATION_PERMISSION,
        )
    }

    private fun openNotificationSettings() {
        startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            },
        )
    }

    private fun updatePermissionButtons() {
        if (::overlayPermissionButton.isInitialized) {
            overlayPermissionButton.text = if (Settings.canDrawOverlays(this)) {
                "카드 오버레이 권한 허용됨 · 시스템 설정"
            } else {
                "카드 오버레이 권한 허용하기"
            }
        }
        if (::notificationPermissionButton.isInitialized) {
            notificationPermissionButton.text = if (hasNotificationPermission()) {
                "알림 권한 허용됨 · 시스템 알림 설정"
            } else {
                "알림 권한 허용하기"
            }
        }
    }

    private fun settings() = getSharedPreferences(SETTINGS_NAME, MODE_PRIVATE)

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private enum class FontTarget { ADDRESS, BUILDING, UNIT, MEMO }

    private data class ColorField(
        val root: LinearLayout,
        val input: EditText,
        val swatch: TextView,
    )

    companion object {
        private const val SETTINGS_NAME = "nav_capture_settings"
        private const val KEY_AUTO_FORWARD = "auto_forward"
        private const val KEY_NAV_APP = "nav_app"
        private const val KEY_DISPLAY_ENABLED = "overlay_enabled"
        private const val REQUEST_NOTIFICATION_PERMISSION = 8101
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
