package com.winzfs.navcapture.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.graphics.Typeface
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.diagnostics.IncomingIntentLogStore

class IntentDiagnosticsActivity : Activity() {
    private lateinit var countText: TextView
    private lateinit var logText: TextView
    private lateinit var store: IncomingIntentLogStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = IncomingIntentLogStore(this)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        renderLogs()
    }

    private fun buildUi() {
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "수신 기록",
                subtitleText = "배달앱이 넘긴 원본 Intent와 파싱 결과를 확인합니다.",
            ),
        )

        val summaryCard = RiderUi.card(
            context = this,
            titleText = "개발 진단",
            subtitleText = "주소와 메모가 포함될 수 있으며 기록은 이 기기에만 저장됩니다. 토큰·키·비밀번호 계열 값은 자동 마스킹됩니다.",
        )
        countText = TextView(this).apply {
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(RiderUi.body)
            setPadding(0, RiderUi.dp(this@IntentDiagnosticsActivity, 10), 0, 0)
        }
        summaryCard.addView(countText)

        val actionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        actionRow.addView(
            RiderUi.primaryButton(this, "전체 복사") { copyAllLogs() },
            RiderUi.weighted(this, end = 4, heightDp = 45),
        )
        actionRow.addView(
            RiderUi.dangerButton(this, "전체 삭제") { confirmClear() },
            RiderUi.weighted(this, start = 4, heightDp = 45),
        )
        summaryCard.addView(actionRow, RiderUi.fullWidth(this, top = 12))
        root.addView(summaryCard, RiderUi.fullWidth(this, bottom = 12))

        val logCard = RiderUi.card(
            context = this,
            titleText = "최근 기록",
            subtitleText = "최신 기록부터 최대 100건까지 보관합니다.",
        )
        logText = TextView(this).apply {
            textSize = 11.5f
            setTypeface(Typeface.MONOSPACE)
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.12f)
            setTextIsSelectable(true)
            setPadding(0, RiderUi.dp(this@IntentDiagnosticsActivity, 10), 0, 0)
        }
        logCard.addView(logText)
        root.addView(logCard, RiderUi.fullWidth(this))

        setContentView(page.scroll)
    }

    private fun renderLogs() {
        if (!::logText.isInitialized) return
        val entries = store.load()
        countText.text = "저장된 수신 기록 ${entries.size}건"
        logText.text = if (entries.isEmpty()) {
            "아직 기록이 없습니다.\n배달앱에서 길찾기를 실행하면 성공 여부와 관계없이 기록됩니다."
        } else {
            entries.joinToString("\n\n") { entry ->
                buildString {
                    appendLine(entry.summary)
                    append(entry.content)
                }
            }
        }
    }

    private fun copyAllLogs() {
        val text = store.exportText()
        if (text.isBlank()) {
            toast("복사할 기록이 없습니다.")
            return
        }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("RiderApp 수신 기록", text))
        toast("수신 기록 전체를 복사했습니다.")
    }

    private fun confirmClear() {
        if (store.load().isEmpty()) {
            toast("삭제할 기록이 없습니다.")
            return
        }
        AlertDialog.Builder(this)
            .setTitle("수신 기록 삭제")
            .setMessage("저장된 개발 진단 기록을 모두 삭제할까요?")
            .setNegativeButton("취소", null)
            .setPositiveButton("삭제") { _, _ ->
                store.clear()
                renderLogs()
                toast("수신 기록을 삭제했습니다.")
            }
            .show()
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
