package com.winzfs.navcapture.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.widget.TextView
import kotlin.math.ceil

/**
 * Draws one text layout twice: first as a stroke, then as a fill.
 *
 * Unlike offset-copy outlines, both passes share the exact same line breaks and glyph positions,
 * so narrow overlays and multiline memo text remain sharp and aligned.
 */
class OutlinedTextView(context: Context) : TextView(context) {
    private var fillColor: Int = 0xFFFFFFFF.toInt()
    private var outlineColor: Int = 0x00000000
    private var outlineWidthPx: Float = 0f

    init {
        includeFontPadding = false
        gravity = Gravity.TOP or Gravity.START
        setLineSpacing(0f, 1.03f)
    }

    fun configure(
        value: String,
        sizeSp: Int,
        fillColor: Int,
        outlineColor: Int,
        outlineWidthDp: Int,
        bold: Boolean,
        maxLines: Int,
        topSpacingDp: Int = 3,
        endSpacingDp: Int = 4,
    ) {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp.toFloat())
        this.fillColor = fillColor
        this.outlineColor = outlineColor
        outlineWidthPx = outlineWidthDp * resources.displayMetrics.density
        this.maxLines = maxLines
        setTypeface(typeface, if (bold) Typeface.BOLD else Typeface.NORMAL)

        val edge = ceil(outlineWidthPx / 2f).toInt().coerceAtLeast(0) + if (outlineWidthPx > 0f) 1 else 0
        setPadding(
            edge,
            dp(topSpacingDp) + edge,
            dp(endSpacingDp) + edge,
            edge,
        )
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val textLayout = layout ?: run {
            super.onDraw(canvas)
            return
        }

        val oldStyle = paint.style
        val oldStrokeWidth = paint.strokeWidth
        val oldStrokeJoin = paint.strokeJoin
        val oldStrokeMiter = paint.strokeMiter
        val oldColor = paint.color

        val availableHeight = height - paddingTop - paddingBottom
        val verticalOffset = when (gravity and Gravity.VERTICAL_GRAVITY_MASK) {
            Gravity.CENTER_VERTICAL -> paddingTop + ((availableHeight - textLayout.height) / 2f).coerceAtLeast(0f)
            Gravity.BOTTOM -> (height - paddingBottom - textLayout.height).toFloat()
            else -> paddingTop.toFloat()
        }

        val saveCount = canvas.save()
        canvas.translate(
            paddingLeft.toFloat() - scrollX,
            verticalOffset - scrollY,
        )

        if (outlineWidthPx > 0f && android.graphics.Color.alpha(outlineColor) > 0) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = outlineWidthPx
            paint.strokeJoin = Paint.Join.ROUND
            paint.strokeMiter = 10f
            paint.color = outlineColor
            textLayout.draw(canvas)
        }

        paint.style = Paint.Style.FILL
        paint.strokeWidth = 0f
        paint.color = fillColor
        textLayout.draw(canvas)

        canvas.restoreToCount(saveCount)
        paint.style = oldStyle
        paint.strokeWidth = oldStrokeWidth
        paint.strokeJoin = oldStrokeJoin
        paint.strokeMiter = oldStrokeMiter
        paint.color = oldColor
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
