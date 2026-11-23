# RiderSpot — 출처 표기 재노출 및 헤더 비침 수정 v3
2026-11-23 / 운영 Worker `rider-spot`

## 사용자 현상
- 앱 메인지도와 타임라인 지도 모두 지도 출처가 하단에 긴 글자 링크 줄로 재노출됨. 지도에 진입하거나 탭 이동 직후 특히 반복됨.
- 타임라인 상단에 날짜 16·17·18 등의 글자가 헤더 흰 배경 뒤로 희미하게 비침.
- 기존 v2의 조작부 디자인은 모바일에서 정상 배치되지만 출처 표기 때문에 지도가 답답해 보임.

## 실제 원인
- `unified-map-credits-v2.js`가 접근 가능한 `!` 출처 버튼을 생성한 후에도 **매번 5초 동안 원본 출처를 강제로 펼친 상태**로 유지했음. React/Leaflet 지도는 탭 이동 시 새로 마운트되므로 이 현상이 반복됨. 이전 브라우저 검증은 5초 이후 결과만 확인해 실제 사용자 문제를 놓침.
- `curated-v9.css`에는 `.rs-map-v2 .leaflet-control-attribution`을 `display:block!important` 강제하는 규칙이 있고, 타임라인과 메인지도에 서로 다른 CSS가 적용되었음.
- 실제 브라우저의 `.app > header` computed background가 `rgba(255,255,255,0.96)`으로 확인됨. 스크롤 뒤 날짜 스트립이 희미하게 비침.

## 수정
1. `src/unified-map-credits-v3.js`: 출처가 실제 존재하는 Leaflet 지도에 `!` 버튼 + 출처 팝오버를 먼저 설치한 다음, **동일한 JS 실행 사이클에서** 원본 긴 출처를 접음. 5초 타이머 완전 제거.
2. 새로운 지도나 재마운트된 지도도 MutationObserver로 감지하며, 확인 주기를 최대 160ms로 단축. 버튼이 없거나 원본 출처를 찾지 못하면 원본 출처를 그대로 보존하는 폴백.
3. `src/unified-map-player-v3.css`: v2 플레이어 디자인 유지. 접힘 상태에서 Leaflet attribution의 display/visibility/height 등 충돌 속성 일괄 제어. 원본 Leaflet 출처 링크를 삭제하지 않음.
4. 메인지도와 타임라인에 동일한 `!` 단일 글자 원형 버튼 적용. 누를 때마다 원본 출처 DOM과 모든 링크를 복제해 팝오버에서 표시. 바깥 터치/Esc로 닫기 유지.
5. `.app.rs34-app > header`에 불투명 흰색 배경 `#fff` 적용, backdrop filter 제거. 날짜 글자가 헤더 뒤에서 비치지 않게 수정.
6. v2 재생 버튼·배속·전체 경로·슬라이더·이벤트/시간·확대 컨트롤 CSS는 그대로 보존. 이번 변경으로 이벤트 핸들러, GPS, 경로 및 타임라인 기록 저장 코드는 변경하지 않음.

## 저장된 변경 파일
- `rider-spot-web/src/unified-map-credits-v3.js`
- `rider-spot-web/src/unified-map-player-v3.css`
- `rider-spot-web/edge/rider-spot-map-credits-immediate-v3-candidate.mjs` (운영 Worker에 배포한 동일 버전의 정확한 소스, 183093 characters)
- 롤백: `rider-spot-web/edge/rider-spot-unified-map-player-v2-candidate.mjs` (직전 운영 Worker, 145990 characters)

Worker는 새 `/rider-spot-unified-player-v3.css` 및 `/rider-spot-unified-credits-v3.js`를 본문 `<head>`에 연결. 기존 v2 경로를 삭제하지 않아 이전 세션의 안전한 호환성을 보존함.

## 검증 결과
- Cloudflare Preview Worker에 실제 Worker 후보 배포 성공.
- 390px 안드로이드 유사 브라우저, 메인지도에서 `v3` 로드 즉시 `rs-tl-credits-collapsed=true`, `!` 버튼 가시, `.leaflet-control-attribution display:none`.
- 메인지도 헤더 computed background `rgb(255,255,255)` 확인.
- 동시 렌더링한 메인지도와 타임라인 지도 모두 원본 크레딧 숨김, 각각 단일 `!` 버튼 표시.
- 팝오버에 원본 OpenStreetMap/OpenMapTiles 링크가 유지됨.
- 타임라인 지도를 제거한 뒤 새 Leaflet 지도 DOM을 마운트하는 시뮬레이션에서 **다시 5초 동안 표시하지 않고 즉시 접히는 동작** 확인.
- 운영 Worker 배포 성공. 운영 서비스에서 메인지도 `v3` 즉시 접힘, 팝오버 내 원본 출처 링크 6개, 불투명 헤더 적용 확인.
- My Year v5, Bike Service v35, 기존 지도/재생 앱 번들, recovery guard 및 ASSETS/DESIGN/LEGACY service binding 유지.
- 격리 Preview Worker는 기존 5296자 소스와 preview 전용 서비스 바인딩으로 원상복구.

## 확인 필요/주의
- **실제 안드로이드 사용자 기기에서의 최종 확인은 별도.** 브라우저 기반 회귀 테스트가 통과하더라도 WebView 자체 캐시와 특정 화면 진입 타이밍은 실기기 결과로 재검증해야 한다.
- 운행 중 강제 WebView reload 금지. 운행 종료 후 앱을 완전히 종료해 새 HTML과 v3 리소스 로드.
- 지도 출처 링크의 접근 가능성은 법적 요구에 중요하므로 `!` 자체를 숨기거나 팝오버의 실제 링크를 지우지 말 것.
