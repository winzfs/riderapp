package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.storage.AddressMemoStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AddressMemoActivity : Activity() {
    private lateinit var store: AddressMemoStore
    private lateinit var searchEdit: EditText
    private lateinit var listContainer: LinearLayout
    private lateinit var emptyText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = AddressMemoStore(this)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        renderList(searchEdit.text.toString())
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(20), dp(18), dp(24))
            setBackgroundColor(Color.rgb(245, 246, 248))
        }

        root.addView(TextView(this).apply {
            text = "주소별 개인 메모"
            textSize = 24f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(25, 29, 36))
        })
        root.addView(TextView(this).apply {
            text = "길찾기 중이 아니어도 주소를 추가하고, 저장된 장소 메모를 검색·보기·수정할 수 있습니다."
            textSize = 13f
            setTextColor(Color.rgb(80, 86, 96))
            setPadding(0, dp(7), 0, dp(14))
        })

        searchEdit = EditText(this).apply {
            hint = "주소·장소명·메모 검색"
            textSize = 15f
            setSingleLine(true)
            setPadding(dp(13), dp(10), dp(13), dp(10))
            setBackgroundColor(Color.WHITE)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    renderList(s?.toString().orEmpty())
                }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        root.addView(searchEdit, fullWidthParams(bottom = 10))

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        actions.addView(Button(this).apply {
            text = "새 주소 메모"
            isAllCaps = false
            setOnClickListener {
                startActivity(Intent(this@AddressMemoActivity, MemoEditorActivity::class.java))
            }
        }, weightedParams(end = 4))
        actions.addView(Button(this).apply {
            text = "공식 주소 검색"
            isAllCaps = false
            setOnClickListener { openOfficialAddressSearch() }
        }, weightedParams(start = 4))
        root.addView(actions, fullWidthParams(bottom = 12))

        emptyText = TextView(this).apply {
            text = "저장된 주소 메모가 없습니다."
            textSize = 14f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(100, 106, 116))
            setPadding(dp(8), dp(24), dp(8), dp(24))
        }
        root.addView(emptyText)

        listContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val scroll = ScrollView(this).apply {
            addView(listContainer)
        }
        root.addView(
            scroll,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ),
        )

        setContentView(root)
    }

    private fun renderList(query: String) {
        if (!::listContainer.isInitialized) return
        val entries = store.search(query)
        listContainer.removeAllViews()
        emptyText.visibility = if (entries.isEmpty()) TextView.VISIBLE else TextView.GONE
        entries.forEach { entry -> listContainer.addView(entryCard(entry), fullWidthParams(bottom = 9)) }
    }

    private fun entryCard(entry: AddressMemoEntry): TextView = TextView(this).apply {
        text = buildString {
            appendLine(entry.title)
            entry.roadAddress.takeIf(String::isNotBlank)?.let { appendLine("도로명: $it") }
            entry.address
                .takeIf { it.isNotBlank() && it != entry.roadAddress && it != entry.title }
                ?.let { appendLine("주소: $it") }
            if (entry.memo.isNotBlank()) appendLine("메모: ${entry.memo.take(120)}")
            append("수정: ${formatTime(entry.updatedAt)}")
        }
        textSize = 14f
        setTextColor(Color.rgb(35, 39, 47))
        setPadding(dp(15), dp(13), dp(15), dp(13))
        setBackgroundColor(Color.WHITE)
        setOnClickListener {
            startActivity(MemoEditorActivity.intent(this@AddressMemoActivity, entry.id, false))
        }
    }

    private fun openOfficialAddressSearch() {
        startActivity(
            Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://www.juso.go.kr/openIndexPage.do"),
            ),
        )
    }

    private fun formatTime(timestamp: Long): String =
        SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.KOREA).format(Date(timestamp))

    private fun fullWidthParams(bottom: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(bottom) }

    private fun weightedParams(start: Int = 0, end: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dp(start)
            marginEnd = dp(end)
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}