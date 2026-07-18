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

    private lateinit var placeNameEdit: EditText
    private lateinit var originalAddressEdit: EditText
    private lateinit var roadAddressEdit: EditText
    private lateinit var unitDetailEdit: EditText
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
            text = "도로명주소와 동·호수는 확인·수정할 수 있고, 개인 메모는 한 칸에 자유롭게 기록합니다."
            textSize = 13f
            setTextColor(Color.rgb(80, 86, 96))
            setPadding(0, dp(7), 0, dp(15))
        })

        statusText = card("주소와 메모를 입력해 주세요.")
        root.addView(statusText, params(bottom = 12))

        root.addView(label("장소명 또는 목적지명"))
        placeNameEdit = singleLineEdit("예: 광주광역시청, ○○아파트")
        root.addView(placeNameEdit, params(bottom = 11))

        root.addView(label("지번주소 또는 배달앱 원문 주소"))
        originalAddressEdit = singleLineEdit("배달앱에서 받은 주소 또는 구주소")
        root.addView(originalAddressEdit, params(bottom = 11))

        root.addView(label("도로명주소"))
        roadAddressEdit = singleLineEdit("배달앱 원문을 우선 사용하며 직접 수정할 수 있습니다")
        root.addView(roadAddressEdit, params(bottom = 11))

        root.addView(label("동·호수/상세주소"))
        unitDetailEdit = singleLineEdit("예: 101동 1001호")
        root.addView(unitDetailEdit, params(bottom = 9))

        autoFindButton = Button(this).apply {
            text = "목적지명과 위치로 도로명주소 찾기"
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
        placeNameEdit.setText(entry.placeName)
        originalAddressEdit.setText(entry.address)
        roadAddressEdit.setText(entry.roadAddress)
        unitDetailEdit.setText(entry.unitDetail)
        memoEdit.setText(entry.memo)
        autoFindButton.isEnabled = entry.latitude != null && entry.longitude != null ||
            entry.placeName.isNotBlank() || entry.address.isNotBlank()
        statusText.text = if (entry.roadAddress.isBlank()) {
            "도로명주소가 아직 확인되지 않았습니다. 자동 찾기 후 결과를 직접 수정할 수 있습니다."
        } else {
            "저장된 도로명주소·상세주소·메모를 수정할 수 있습니다."
        }
    }

    private fun saveEntry() {
        val placeName = placeNameEdit.text.toString().trim()
        val originalAddress = originalAddressEdit.text.toString().trim()
        val roadAddress = roadAddressEdit.text.toString().trim()
        val unitDetail = unitDetailEdit.text.toString().trim()
        if (placeName.isBlank() && originalAddress.isBlank() && roadAddress.isBlank()) {
            toast("장소명이나 주소를 하나 이상 입력해 주세요.")
            return
        }

        entry = store.save(
            entry.copy(
                placeName = placeName,
                address = originalAddress,
                roadAddress = roadAddress,
                unitDetail = unitDetail,
                roadAddressConfirmed = roadAddress.isNotBlank(),
                memo = memoEdit.text.toString(),
            ),
        )
        intent.putExtra(EXTRA_ENTRY_ID, entry.id)
        statusText.text = "주소별 메모를 저장했습니다. 직접 수정한 도로명주소는 자동으로 덮어쓰지 않습니다."
        if (refreshOverlay) DestinationOverlayService.show(this, entry)
        toast("저장했습니다.")
    }

    private fun findRoadAddress() {
        val latitude = entry.latitude
        val longitude = entry.longitude
        val destinationName = roadAddressEdit.text.toString().trim()
            .ifBlank { originalAddressEdit.text.toString().trim() }
            .ifBlank { placeNameEdit.text.toString().trim() }

        autoFindButton.isEnabled = false
        statusText.text = "동·호수를 제외하고 도로명주소 후보를 찾는 중입니다."

        if (latitude != null && longitude != null) {
            resolver.resolve(destinationName, latitude, longitude) { result ->
                autoFindButton.isEnabled = true
                result.onSuccess { candidate -> applyCandidate(candidate) }
                    .onFailure { error ->
                        statusText.text = "자동 주소 변환 실패"
                        toast(error.message ?: "도로명주소를 찾지 못했습니다.")
                    }
            }
            return
        }

        if (destinationName.isBlank()) {
            autoFindButton.isEnabled = true
            toast("검색할 장소명이나 주소를 입력해 주세요.")
            return
        }
        resolver.search(destinationName) { result ->
            autoFindButton.isEnabled = true
            result.onSuccess(::showCandidateDialog)
                .onFailure { error ->
                    statusText.text = "주소 검색 실패"
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
            .setTitle("도로명주소 후보 선택")
            .setItems(labels) { _, index -> applyCandidate(roadCandidates[index]) }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun applyCandidate(candidate: RoadAddressResolver.ResolvedAddress) {
        if (candidate.roadAddress.isNotBlank()) {
            roadAddressEdit.setText(candidate.roadAddress)
            roadAddressEdit.setSelection(roadAddressEdit.text.length)
            statusText.text = "도로명주소 후보를 채웠습니다. 동·호수는 기존 값을 유지하므로 저장 전에 확인해 주세요."
        } else {
            statusText.text = "도로명주소를 확정하지 못했습니다. 직접 확인해 주세요."
        }
    }

    private fun confirmDelete() {
        if (store.findById(entry.id) == null) {
            finish()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("주소 메모 삭제")
            .setMessage("이 주소와 개인 메모를 삭제할까요?")
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
