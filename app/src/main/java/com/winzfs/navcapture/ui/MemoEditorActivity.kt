package com.winzfs.navcapture.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.address.RoadAddressResolver
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.overlay.DestinationOverlayService
import com.winzfs.navcapture.storage.AddressMemoStore

class MemoEditorActivity : Activity() {
    private lateinit var store: AddressMemoStore
    private lateinit var resolver: RoadAddressResolver
    private lateinit var entry: AddressMemoEntry

    private lateinit var sourceTextView: TextView
    private lateinit var placeNameEdit: EditText
    private lateinit var roadAddressEdit: EditText
    private lateinit var memoEdit: EditText
    private lateinit var statusText: TextView
    private lateinit var autoFindButton: Button

    private val refreshOverlay: Boolean
        get() = intent.getBooleanExtra(EXTRA_REFRESH_OVERLAY, false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = AddressMemoStore(this)
        resolver = RoadAddressResolver(this)
        entry = intent.getStringExtra(EXTRA_ENTRY_ID)
            ?.let(store::findById)
            ?: store.createBlank()
        buildUi()
        renderEntry()
    }

    private fun buildUi() {
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.rgb(245, 246, 248))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(20), dp(18), dp(28))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "장소 메모 수정"
            textSize = 24f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(25, 29, 36))
        })
        root.addView(TextView(this).apply {
            text = "배달앱 원문은 수정하지 않습니다. 참고 도로명주소와 개인 메모만 별도로 저장합니다."
            textSize = 13f
            setTextColor(Color.rgb(80, 86, 96))
            setPadding(0, dp(7), 0, dp(15))
        })

        statusText = card("주소와 메모를 입력해 주세요.")
        root.addView(statusText, params(bottom = 12))

        root.addView(label("배달앱 원문 · 수정 불가"))
        sourceTextView = card("직접 추가한 메모에는 배달앱 원문이 없습니다.").apply {
            setTextIsSelectable(true)
        }
        root.addView(sourceTextView, params(bottom = 13))

        root.addView(label("내 표시 이름 · 선택"))
        placeNameEdit = singleLineEdit("예: 수완 ○○아파트, 자주 가는 가게")
        root.addView(placeNameEdit, params(bottom = 11))

        root.addView(label("참고 도로명주소 · 내비 입력에 사용하지 않음"))
        roadAddressEdit = singleLineEdit("자동으로 찾거나 직접 입력할 수 있습니다")
        root.addView(roadAddressEdit, params(bottom = 9))

        autoFindButton = Button(this).apply {
            text = "원문과 위치로 참고 도로명주소 찾기"
            isAllCaps = false
            setOnClickListener { findRoadAddress() }
        }
        root.addView(autoFindButton, params(bottom = 7))

        root.addView(Button(this).apply {
            text = "공식 도로명주소 검색 페이지 열기"
            isAllCaps = false
            setOnClickListener { openOfficialAddressSearch() }
        }, params(bottom = 15))

        root.addView(label("개인 메모"))
        memoEdit = EditText(this).apply {
            hint = "예: 동쪽 후문 진입이 빠름 / 오토바이는 지하주차장 불가"
            textSize = 15f
            minLines = 5
            maxLines = 10
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            setPadding(dp(13), dp(12), dp(13), dp(12))
            setBackgroundColor(Color.WHITE)
        }
        root.addView(memoEdit, params(bottom = 12))

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        actions.addView(Button(this).apply {
            text = "저장"
            isAllCaps = false
            setOnClickListener { saveEntry() }
        }, weightedParams(end = 4))
        actions.addView(Button(this).apply {
            text = "삭제"
            isAllCaps = false
            setOnClickListener { confirmDelete() }
        }, weightedParams(start = 4))
        root.addView(actions)

        setContentView(scroll)
    }

    private fun renderEntry() {
        sourceTextView.text = entry.sourceText.ifBlank {
            "직접 추가한 메모에는 배달앱 원문이 없습니다."
        }
        placeNameEdit.setText(entry.placeName)
        roadAddressEdit.setText(entry.roadAddress)
        memoEdit.setText(entry.memo)
        autoFindButton.isEnabled = entry.latitude != null && entry.longitude != null ||
            entry.sourceText.isNotBlank() || entry.placeName.isNotBlank()
        statusText.text = if (entry.roadAddress.isBlank()) {
            "배달앱 원문은 그대로 보존됩니다. 필요할 때만 참고 주소를 추가하세요."
        } else {
            "참고 주소와 메모를 수정할 수 있습니다. 배달앱 원문과 내비 목적지는 바뀌지 않습니다."
        }
    }

    private fun saveEntry() {
        val placeName = placeNameEdit.text.toString().trim()
        val roadAddress = roadAddressEdit.text.toString().trim()
        if (entry.sourceText.isBlank() && placeName.isBlank() && roadAddress.isBlank()) {
            toast("직접 추가할 때는 표시 이름이나 참고 주소를 입력해 주세요.")
            return
        }

        entry = store.save(
            entry.copy(
                placeName = placeName,
                roadAddress = roadAddress,
                roadAddressConfirmed = roadAddress.isNotBlank(),
                memo = memoEdit.text.toString(),
            ),
        )
        intent.putExtra(EXTRA_ENTRY_ID, entry.id)
        statusText.text = "참고 주소와 메모를 저장했습니다. 배달앱 원문은 변경하지 않았습니다."
        if (refreshOverlay) DestinationOverlayService.show(this, entry)
        toast("저장했습니다.")
    }

    private fun findRoadAddress() {
        val latitude = entry.latitude
        val longitude = entry.longitude
        val query = entry.sourceText
            .ifBlank { roadAddressEdit.text.toString().trim() }
            .ifBlank { placeNameEdit.text.toString().trim() }

        autoFindButton.isEnabled = false
        statusText.text = "배달앱 원문은 유지한 채 참고 도로명주소 후보를 찾는 중입니다."

        if (latitude != null && longitude != null) {
            resolver.resolve(query, latitude, longitude) { result ->
                autoFindButton.isEnabled = true
                result.onSuccess { candidate -> applyCandidate(candidate) }
                    .onFailure { error ->
                        statusText.text = "참고 주소 확인 실패 · 배달앱 원문은 그대로 유지됨"
                        toast(error.message ?: "도로명주소 후보를 찾지 못했습니다.")
                    }
            }
            return
        }

        if (query.isBlank()) {
            autoFindButton.isEnabled = true
            toast("검색할 장소명이나 주소를 입력해 주세요.")
            return
        }
        resolver.search(query) { result ->
            autoFindButton.isEnabled = true
            result.onSuccess(::showCandidateDialog)
                .onFailure { error ->
                    statusText.text = "참고 주소 검색 실패"
                    toast(error.message ?: "주소 후보를 찾지 못했습니다.")
                }
        }
    }

    private fun showCandidateDialog(candidates: List<RoadAddressResolver.ResolvedAddress>) {
        val roadCandidates = candidates.filter { it.roadAddress.isNotBlank() }
        if (roadCandidates.isEmpty()) {
            statusText.text = "도로명주소 후보가 없습니다."
            toast("도로명주소 검색 결과가 없습니다.")
            return
        }
        val labels = roadCandidates.map { candidate ->
            buildString {
                append(candidate.roadAddress)
                candidate.placeName.takeIf(String::isNotBlank)?.let { append("\n$it") }
            }
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("참고 도로명주소 후보 선택")
            .setItems(labels) { _, index -> applyCandidate(roadCandidates[index]) }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun applyCandidate(candidate: RoadAddressResolver.ResolvedAddress) {
        if (candidate.roadAddress.isNotBlank()) {
            roadAddressEdit.setText(candidate.roadAddress)
            roadAddressEdit.setSelection(roadAddressEdit.text.length)
            statusText.text = "참고 주소만 채웠습니다. 배달앱 원문과 실제 내비 목적지는 그대로입니다."
        } else {
            statusText.text = "참고 도로명주소를 확인하지 못했습니다."
        }
    }

    private fun confirmDelete() {
        if (store.findById(entry.id) == null) {
            finish()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("주소 메모 삭제")
            .setMessage("이 장소의 참고 주소와 개인 메모를 삭제할까요?")
            .setPositiveButton("삭제") { _, _ ->
                store.delete(entry.id)
                if (refreshOverlay) DestinationOverlayService.hide(this)
                toast("삭제했습니다.")
                finish()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun openOfficialAddressSearch() {
        startActivity(
            Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://www.juso.go.kr/openIndexPage.do"),
            ),
        )
    }

    private fun label(value: String): TextView = TextView(this).apply {
        text = value
        textSize = 14f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.rgb(45, 50, 58))
        setPadding(dp(2), dp(3), dp(2), dp(6))
    }

    private fun singleLineEdit(hintText: String): EditText = EditText(this).apply {
        hint = hintText
        textSize = 15f
        setSingleLine(true)
        setPadding(dp(13), dp(10), dp(13), dp(10))
        setBackgroundColor(Color.WHITE)
    }

    private fun card(value: String): TextView = TextView(this).apply {
        text = value
        textSize = 13f
        setTextColor(Color.rgb(45, 50, 58))
        setPadding(dp(14), dp(12), dp(14), dp(12))
        setBackgroundColor(Color.WHITE)
    }

    private fun params(bottom: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(bottom) }

    private fun weightedParams(start: Int = 0, end: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dp(start)
            marginEnd = dp(end)
        }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val EXTRA_ENTRY_ID = "entry_id"
        private const val EXTRA_REFRESH_OVERLAY = "refresh_overlay"

        fun intent(context: Context, entryId: String, refreshOverlay: Boolean): Intent =
            Intent(context, MemoEditorActivity::class.java).apply {
                putExtra(EXTRA_ENTRY_ID, entryId)
                putExtra(EXTRA_REFRESH_OVERLAY, refreshOverlay)
            }
    }
}
