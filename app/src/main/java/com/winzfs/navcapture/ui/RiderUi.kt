package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Small native design system used across RiderApp screens. */
object RiderUi {
    val pageBackground: Int = Color.rgb(244, 246, 249)
    val surface: Int = Color.WHITE
    val title: Int = Color.rgb(25, 30, 39)
    val body: Int = Color.rgb(72, 80, 94)
    val muted: Int = Color.rgb(112, 120, 134)
    val border: Int = Color.rgb(226, 231, 238)
    val soft: Int = Color.rgb(247, 249, 252)
    val accent: Int = Color.rgb(51, 94, 224)
    val accentSoft: Int = Color.rgb(234, 239, 255)
    val danger: Int = Color.rgb(201, 62, 62)
    val success: Int = Color.rgb(40, 139, 89)

    data class Page(
        val scroll: ScrollView,
        val root: LinearLayout,
    )

    fun page(context: Context): Page {
        val scroll = ScrollView(context).apply {
            isFillViewport = true
            setBackgroundColor(pageBackground)
            clipToPadding = false
        }
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(context, 18), dp(context, 15), dp(context, 18), dp(context, 36))
        }
        scroll.addView(
            root,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ),
        )
        return Page(scroll, root)
    }

    fun topBar(
        activity: Activity,
        titleText: String,
        subtitleText: String? = null,
        showBack: Boolean = true,
    ): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(activity, 1), 0, dp(activity, 17))

        if (showBack) {
            addView(
                TextView(activity).apply {
                    text = "‹"
                    textSize = 34f
                    gravity = Gravity.CENTER
                    setTextColor(title)
                    background = ripple(activity, Color.TRANSPARENT, 14f)
                    setOnClickListener { activity.finish() }
                },
                LinearLayout.LayoutParams(dp(activity, 44), dp(activity, 44)).apply {
                    marginEnd = dp(activity, 7)
                },
            )
        }

        val titles = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(activity).apply {
                text = titleText
                textSize = 25f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(title)
            })
            subtitleText?.takeIf(String::isNotBlank)?.let { subtitle ->
                addView(TextView(activity).apply {
                    text = subtitle
                    textSize = 13f
                    setTextColor(muted)
                    setPadding(0, dp(activity, 2), 0, 0)
                })
            }
        }
        addView(titles, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    }

    fun card(
        context: Context,
        titleText: String? = null,
        subtitleText: String? = null,
        paddingDp: Int = 16,
    ): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(context, paddingDp), dp(context, 15), dp(context, paddingDp), dp(context, 16))
        background = rounded(surface, 18f, border, 1, context)
        elevation = dp(context, 1).toFloat()
        titleText?.let {
            addView(TextView(context).apply {
                text = it
                textSize = 17f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(title)
            })
        }
        subtitleText?.takeIf(String::isNotBlank)?.let {
            addView(TextView(context).apply {
                text = it
                textSize = 12.5f
                setTextColor(muted)
                setLineSpacing(0f, 1.12f)
                setPadding(0, dp(context, 4), 0, 0)
            })
        }
    }

    fun sectionLabel(context: Context, textValue: String): TextView = TextView(context).apply {
        text = textValue
        textSize = 13f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(muted)
        setPadding(dp(context, 3), dp(context, 5), dp(context, 3), dp(context, 8))
    }

    fun valueBox(context: Context, value: String = ""): TextView = TextView(context).apply {
        text = value
        textSize = 14f
        gravity = Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(title)
        setPadding(dp(context, 10), dp(context, 11), dp(context, 10), dp(context, 11))
        background = rounded(soft, 12f, border, 1, context)
    }

    fun input(context: Context, hintText: String, multiline: Boolean = false): EditText = EditText(context).apply {
        hint = hintText
        textSize = 15f
        setTextColor(title)
        setHintTextColor(muted)
        gravity = if (multiline) Gravity.TOP or Gravity.START else Gravity.CENTER_VERTICAL
        minLines = if (multiline) 4 else 1
        maxLines = if (multiline) 8 else 1
        setSingleLine(!multiline)
        setPadding(dp(context, 13), dp(context, 11), dp(context, 13), dp(context, 11))
        background = rounded(surface, 13f, border, 1, context)
    }

    fun primaryButton(context: Context, label: String, action: () -> Unit): Button = styledButton(
        context = context,
        label = label,
        textColor = Color.WHITE,
        backgroundColor = accent,
        borderColor = null,
        action = action,
    )

    fun secondaryButton(context: Context, label: String, action: () -> Unit): Button = styledButton(
        context = context,
        label = label,
        textColor = title,
        backgroundColor = soft,
        borderColor = border,
        action = action,
    )

    fun dangerButton(context: Context, label: String, action: () -> Unit): Button = styledButton(
        context = context,
        label = label,
        textColor = danger,
        backgroundColor = Color.rgb(255, 244, 244),
        borderColor = Color.rgb(244, 210, 210),
        action = action,
    )

    fun smallButton(context: Context, label: String, action: () -> Unit): Button = secondaryButton(context, label, action).apply {
        textSize = 13f
        setPadding(dp(context, 8), 0, dp(context, 8), 0)
    }

    private fun styledButton(
        context: Context,
        label: String,
        textColor: Int,
        backgroundColor: Int,
        borderColor: Int?,
        action: () -> Unit,
    ): Button = Button(context).apply {
        text = label
        isAllCaps = false
        textSize = 14f
        minHeight = 0
        minWidth = 0
        stateListAnimator = null
        setTextColor(textColor)
        setPadding(dp(context, 12), 0, dp(context, 12), 0)
        background = ripple(
            context = context,
            color = backgroundColor,
            radiusDp = 13f,
            strokeColor = borderColor,
            strokeWidthDp = if (borderColor == null) 0 else 1,
        )
        setOnClickListener { action() }
    }

    fun rounded(
        color: Int,
        radiusDp: Float,
        strokeColor: Int? = null,
        strokeWidthDp: Int = 0,
        context: Context,
    ): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(context, radiusDp).toFloat()
        if (strokeColor != null && strokeWidthDp > 0) {
            setStroke(dp(context, strokeWidthDp), strokeColor)
        }
    }

    fun ripple(
        context: Context,
        color: Int,
        radiusDp: Float,
        strokeColor: Int? = null,
        strokeWidthDp: Int = 0,
    ): RippleDrawable {
        val content = rounded(color, radiusDp, strokeColor, strokeWidthDp, context)
        return RippleDrawable(
            ColorStateList.valueOf(Color.argb(28, 40, 50, 75)),
            content,
            null,
        )
    }

    fun fullWidth(
        context: Context,
        top: Int = 0,
        bottom: Int = 0,
        heightDp: Int? = null,
    ): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        heightDp?.let { dp(context, it) } ?: LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply {
        topMargin = dp(context, top)
        bottomMargin = dp(context, bottom)
    }

    fun weighted(
        context: Context,
        start: Int = 0,
        end: Int = 0,
        heightDp: Int = 44,
    ): LinearLayout.LayoutParams = LinearLayout.LayoutParams(0, dp(context, heightDp), 1f).apply {
        marginStart = dp(context, start)
        marginEnd = dp(context, end)
    }

    fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
    fun dp(context: Context, value: Float): Int = (value * context.resources.displayMetrics.density).toInt()
}
