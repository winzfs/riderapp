# RIDERSPOT / 지도 출처·타임라인 플레이어 v2

작업일: 2026-11-23  
운영 Worker: `rider-spot`  
실서비스: `https://rider-spot.jazzhjm.workers.dev/`

## 배경 및 원인
사용자 스크린샷에서는 타임라인 지도에 큰 출처 텍스트가 사라졌지만 `ⓘ 출처` 글자 버튼이 남았고, 지도 조작부의 큰 버튼·둥근 박스·슬라이더 외곽선이 앱의 에디토리얼 미니멀 디자인과 부조화를 보였다. 또한 메인지도 출처가 다시 원문 전체로 노출됐다.

근본 원인: 메인지도 웹 번들 `curated-v9.css`에 `.app .nearby.nearby-full .rs-map-v2 .leaflet-control-attribution {display:block!important;visibility:visible!important}` 규칙이 있어, 타임라인 전용 기존 출처 접기 스크립트가 메인지도에서는 작동하지 않았다. 타임라인 조작부에도 서로 다른 시기에 추가된 `!important` 스타일이 중첩됐다.

## 화면 구성 및 변경
- **두 지도에 통합 출처 UI:** 메인지도와 타임라인(하루 통합 지도·개별 운행 지도) 모두 5초간 원본 출처를 노출한 후 좌하단 작은 원형 `!` 버튼으로 접는다. 버튼의 접근성 이름은 `지도 출처 및 라이선스 정보 보기`.
- **출처 팝오버:** 누르면 현재 Leaflet attribution DOM에 있는 원본 텍스트와 모든 URL을 그대로 복제해 표시. 제공자/타일이 바뀔 때도 열 때 갱신하며 실제 출처 내용을 삭제하거나 임의로 새로 만들지 않는다.
- **메인지도 노출 규칙 충돌 수정:** 강제 `display:block!important`보다 높은 우선순위로, JS가 실제 출처 버튼 설치 후 접힘 상태를 표시했을 때만 긴 텍스트를 숨기는 스타일을 적용한다. 버그 재발 시 원본 표기가 보이도록 안전 폴백.
- **타임라인 재생:** 커다란 블루 버튼을 제거하고 35px 블루 아이콘 배경과 텍스트를 가진 가벼운 조작으로 변경. 배속은 간단한 텍스트 셀렉트, 전체 경로는 경계선 하나로 분리.
- **슬라이더:** 기존 박스처럼 보이는 border/background 제거. 3px 트랙과 15px 썸, 29px 전체 입력 높이. 기존 재생 상태와 seek 핸들러 유지.
- **하단 보기 설정:** 버튼을 카드처럼 보이게 만들지 않고 활성 상태를 2px 밑줄로만 표시. 확대/닫기 버튼도 같은 타입/기준선으로 통일.
- **저장:** 작은 고스트 액션 `↗ 저장`. 기존 aria-label 및 이미지 생성 핸들러 유지.
- **줌:** Leaflet 기본 줌 UI를 보다 작은 화이트 일체형 조작으로 표시. 기존 줌 동작 변경 없음.

## 실제 수정한 파일
- `rider-spot-web/src/unified-map-credits-v2.js`: 메인지도·타임라인 양쪽 출처를 관리하는 DOM addon (원본 지도 컨테이너의 Leaflet 소유 영역에만 추가)
- `rider-spot-web/src/unified-map-player-v2.css`: v1 스타일 포함 + 새로운 v2 디자인, 메인지도 출처 규칙 우선순위 보정
- `rider-spot-web/edge/rider-spot-unified-map-player-v2-candidate.mjs`: 운영에 배포한 **정확한 후보 Worker 코드(145,990 문자)**. v2 JS/CSS를 Worker 안에 포함하고 동일 출처 경로에서 제공.
- **복구본:** `rider-spot-web/edge/rider-spot-timeline-controls-v1-candidate.mjs` (직전 운영 코드 110,686 문자), `rider-spot-web/edge/backups/rider-spot-prod-before-timeline-polish-20261123.mjs` (그 이전 운영 코드 89,977 문자).

기존 v1 경로는 새 클라이언트에서는 로드하지 않지만 직전 앱 세션 호환을 위해 제거하지 않았다.

## 검증
- Cloudflare Browser Rendering에서 390px 모바일 테스트: 두 지도에 `!` 텍스트만 남고 긴 출처는 5초 후 `display:none`. 원본 OpenStreetMap attribution 링크가 팝오버에서 유지되는 것 확인.
- 390px 조작부: `grid-template-columns` 237px/53px/62px, 실제 플레이 버튼은 92px 폭, 배속과 전체 경로는 오른쪽에 정렬. 플레이어 버튼 높이 44px. 슬라이더 border `0px`, 하단 컨트롤 배경 transparent.
- 운영 실제 메인지도: 긴 출처 접힌 상태 확인, `!` 버튼과 팝오버 정상 작동, 지도 출처 링크 총 6개 확인.
- 운영 HTML: v2 CSS/JS URL, My Year v5, Bike service v35, 기존 앱 번들 및 recovery guard 정상 로드.
- 운영 Worker 업로드 API 성공. `ASSETS / DESIGN / LEGACY` 바인딩과 서비스 연결 유지.
- 미리보기 Worker 원래 스크립트/서비스 바인딩 복구 완료.
- 실제 로그인된 Android 기기에서 경로를 재생하거나 이미지를 저장하는 기능 테스트는 수행하지 못했다. UI 재설계는 이벤트 핸들러/운행 로직을 변경하지 않음.

## 출시 후 기기 검증 포인트
1. 앱을 완전히 종료했다가 다시 열어 메인지도에서 `!` 단일 버튼 확인. 처음 5초 동안 원본 출처 표시 여부 확인.
2. 타임라인의 경로 지도에서 `!` 버튼, 출처 팝업 링크 확인.
3. 재생/일시정지, 배속 선택, 전체 경로 복귀, 슬라이더 탐색.
4. 이벤트/시간 토글, 지도 확대/닫기, 이미지 저장.
5. 이전의 시작·종료 지점과 경로 형태가 정확히 유지되는지 확인.

## 롤백
`edge/rider-spot-timeline-controls-v1-candidate.mjs`를 기존 `ASSETS=rider-spot-curated-v9-assets`, `DESIGN=rider-spot-atelier-v8`, `LEGACY=rider-spot-api-core-qa` service bindings 및 compatibility_date `2026-11-19`로 `rider-spot` Worker에 배포.

## 유지보수 주의
루트 HTML에 삽입되는 `/rider-spot-unified-player-v2.css`, `/rider-spot-unified-credits-v2.js`와 해당 동일 출처 응답 라우트를 이후 배포에서 제거하지 않는다. 이전 앱 재시작 이슈의 재발 방지를 위해 운행 중 WebView 강제 reload는 금지한다.
