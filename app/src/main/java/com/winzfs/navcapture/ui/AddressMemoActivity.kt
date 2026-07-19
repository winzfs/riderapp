package com.winzfs.navcapture.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.widget.EditText
import android.widget.LinearLayout
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
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "주소 메모",
                subtitleText = "주소별 개인 메모를 검색하고 관리합니다.",
            ),
        )

        searchEdit = RiderUi.input(this, "주소·건물명·메모 검색").apply {
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    renderList(s?.toString().orEmpty())
                }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        root.addView(searchEdit, RiderUi.fullWidth(this, bottom = 10))

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(
                RiderUi.primaryButton(this@AddressMemoActivity, "새 주소 메모") {
                    startActivity(Intent(this@AddressMemoActivity, MemoEditorActivity::class.java))
                },
                RiderUi.weighted(this@AddressMemoActivity, end = 4, heightDp = 46),
            )
            addView(
                RiderUi.secondaryButton(this@AddressMemoActivity, "공식 주소 검색") {
                    openOfficialAddressSearch()
                },
                RiderUi.weighted(this@AddressMemoActivity, start = 4, heightDp = 46),
            )
        }
        root.addView(actions, RiderUi.fullWidth(this, bottom = 14))

        emptyText = TextView(this).apply {
            text = "저장된 주소 메모가 없습니다."
            textSize = 14f
            gravity = Gravity.CENTER
            setTextColor(RiderUi.muted)
            setPadding(8, RiderUi.dp(this@AddressMemoActivity, 34), 8, RiderUi.dp(this@AddressMemoActivity, 34))
        }
        root.addView(emptyText)

        listContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        root.addView(listContainer, RiderUi.fullWidth(this))

        setContentView(page.scroll)
    }

    private fun renderList(query: String) {
        if (!::listContainer.isInitialized) return
        val entries = store.search(query)
        listContainer.removeAllViews()
        emptyText.visibility = if (entries.isEmpty()) TextView.VISIBLE else TextView.GONE
        entries.forEach { entry ->
            listContainer.addView(entryCard(entry), RiderUi.fullWidth(this, bottom = 9))
        }
    }

    private fun entryCard(entry: AddressMemoEntry): LinearLayout = RiderUi.card(this, paddingDp = 15).apply {
        isClickable = true
        isFocusable = true
        background = RiderUi.ripple(
            context = this@AddressMemoActivity,
            color = RiderUi.surface,
            radiusDp = 18f,
            strokeColor = RiderUi.border,
            strokeWidthDp = 1,
        )

        val titleText = entry.placeName.ifBlank {
            entry.sourceText.ifBlank {
                entry.roadAddress.ifBlank { "직접 추가한 메모" }
            }
        }
        addView(TextView(this@AddressMemoActivity).apply {
            text = titleText
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(RiderUi.title)
            maxLines = 2
        })

        val address = when {
            entry.roadAddress.isNotBlank() -> entry.roadAddress
            entry.sourceText.isNotBlank() && entry.sourceText != titleText -> entry.sourceText
            else -> ""
        }
        if (address.isNotBlank()) {
            addView(TextView(this@AddressMemoActivity).apply {
                text = address
                textSize = 13f
                setTextColor(RiderUi.body)
                maxLines = 2
                setPadding(0, RiderUi.dp(this@AddressMemoActivity, 6), 0, 0)
            })
        }

        addView(TextView(this@AddressMemoActivity).apply {
            text = entry.memo.ifBlank { "저장된 메모 없음" }
            textSize = 13f
            setTextColor(if (entry.memo.isBlank()) RiderUi.muted else RiderUi.body)
            maxLines = 3
            setLineSpacing(0f, 1.12f)
            setPadding(0, RiderUi.dp(this@AddressMemoActivity, 8), 0, 0)
        })

        addView(TextView(this@AddressMemoActivity).apply {
            text = "수정 ${formatTime(entry.updatedAt)}"
            textSize = 11.5f
            setTextColor(RiderUi.muted)
            setPadding(0, RiderUi.dp(this@AddressMemoActivity, 9), 0, 0)
        })

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
}
