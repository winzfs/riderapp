package com.winzfs.navcapture.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.winzfs.navcapture.address.RoadAddressResolver
import com.winzfs.navcapture.model.AddressMemoEntry
import com.winzfs.navcapture.overlay.DestinationDisplayController
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

    private val refreshDisplay: Boolean
        get() = intent.getBooleanExtra(EXTRA_REFRESH_DISPLAY, false)

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
        val page = RiderUi.page(this)
        val root = page.root
        root.addView(
            RiderUi.topBar(
                activity = this,
                titleText = "장소 메모",
                subtitleText = "배달앱 원문과 내비 목적지는 변경하지 않습니다.",
            ),
        )

        val statusCard = RiderUi.card(this)
        statusText = TextView(this).apply {
            textSize = 13f
            setTextColor(RiderUi.body)
            setLineSpacing(0f, 1.15f)
        }
        statusCard.addView(statusText)
        root.addView(statusCard, RiderUi.fullWidth(this, bottom = 12))

        val sourceCard = RiderUi.card(this, "배달앱 원문", "수정할 수 없는 원본 정보입니다.")
        sourceTextView = TextView(this).apply {
            textSize = 14f
            setTextColor(RiderUi.title)
            setTextIsSelectable(true)
            setLineSpacing(0f, 1.14f)
            setPadding(0, RiderUi.dp(this@MemoEditorActivity, 10), 0, 0)
        }
        sourceCard.addView(sourceTextView)
        root.addView(sourceCard, RiderUi.fullWidth(this, bottom = 12))

        val editCard = RiderUi.card(this, "표시 정보", "내가 알아보기 쉬운 이름과 참고 주소를 저장합니다.")
        editCard.addView(RiderUi.sectionLabel(this, "내 표시 이름"), RiderUi.fullWidth(this, top = 8))
        placeNameEdit = RiderUi.input(this, "예: 수완 ○○아파트, 자주 가는 가게")
        editCard.addView(placeNameEdit, RiderUi.fullWidth(this))

        editCard.addView(RiderUi.sectionLabel(this, "참고 도로명주소"), RiderUi.fullWidth(this, top = 8))
        roadAddressEdit = RiderUi.input(this, "자동으로 찾거나 직접 입력할 수 있습니다")
        editCard.addView(roadAddressEdit, RiderUi.fullWidth(this))

        autoFindButton = RiderUi.secondaryButton(this, "원문과 위치로 참고 주소 찾기") {
            findRoadAddress()
        }
        editCard.addView(autoFindButton, RiderUi.fullWidth(this, top = 9, heightDp = 44))
        editCard.addView(
            RiderUi.secondaryButton(this, "공식 도로명주소 검색 페이지") {
                openOfficialAddressSearch()
            },
            RiderUi.fullWidth(this, top = 7, heightDp = 44),
        )
        root.addView(editCard, RiderUi.fullWidth(this, bottom = 12))

        val memoCard = RiderUi.card(this, "개인 메모", "배달할 때 바로 확인할 내용을 적습니다.")
        memoEdit = RiderUi.input(
            this,
            "예: 동쪽 후문 진입이 빠름 / 오토바이는 지하주차장 불가",
            multiline = true,
        ).apply {
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            minLines = 5
            maxLines = 10
        }
        memoCard.addView(memoEdit, RiderUi.fullWidth(this, top = 10))
        root.addView(memoCard, RiderUi.fullWidth(this, bottom = 12))

        root.addView(
            RiderUi.primaryButton(this, "저장") { saveEntry() },
            RiderUi.fullWidth(this, bottom = 8, heightDp = 50),
        )
        root.addView(
            RiderUi.dangerButton(this, "이 주소 메모 삭제") { confirmDelete() },
            RiderUi.fullWidth(this, heightDp = 46),
        )

        setContentView(page.scroll)
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
            "원본 목적지는 그대로 보존됩니다. 필요할 때만 참고 주소와 개인 메모를 추가하세요."
        } else {
            "참고 주소와 메모만 수정됩니다. 배달앱 원문과 실제 내비 목적지는 그대로 유지됩니다."
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
        if (refreshDisplay) DestinationDisplayController.show(this, entry)
        toast("저장했습니다.")
    }

    private fun findRoadAddress() {
        val latitude = entry.latitude
        val longitude = entry.longitude
        val query = entry.sourceText
            .ifBlank { roadAddressEdit.text.toString().trim() }
            .ifBlank { placeNameEdit.text.toString().trim() }

        autoFindButton.isEnabled = false
        statusText.text = "배달앱 원문은 유지한 채 참고 도로명주소 후보를 찾고 있습니다."

        if (latitude != null && longitude != null) {
            resolver.resolve(query, latitude, longitude) { result ->
                autoFindButton.isEnabled = true
                result.onSuccess { candidate -> applyCandidate(candidate) }
                    .onFailure { error ->
                        statusText.text = "참고 주소 확인에 실패했습니다. 원본 목적지는 그대로 유지됩니다."
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
                    statusText.text = "참고 주소 검색에 실패했습니다."
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
            .setTitle("참고 도로명주소 후보")
            .setItems(labels) { _, index -> applyCandidate(roadCandidates[index]) }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun applyCandidate(candidate: RoadAddressResolver.ResolvedAddress) {
        if (candidate.roadAddress.isNotBlank()) {
            roadAddressEdit.setText(candidate.roadAddress)
            roadAddressEdit.setSelection(roadAddressEdit.text.length)
            statusText.text = "참고 주소만 채웠습니다. 실제 내비 목적지는 그대로입니다."
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
                if (refreshDisplay) DestinationDisplayController.hide(this)
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

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    companion object {
        private const val EXTRA_ENTRY_ID = "entry_id"
        private const val EXTRA_REFRESH_DISPLAY = "refresh_overlay"

        fun intent(context: Context, entryId: String, refreshOverlay: Boolean): Intent =
            Intent(context, MemoEditorActivity::class.java).apply {
                putExtra(EXTRA_ENTRY_ID, entryId)
                putExtra(EXTRA_REFRESH_DISPLAY, refreshOverlay)
            }
    }
}
