# RiderSpot — 메인지도 및 타임라인 레이아웃 v4
2026-11-23 / 운영 Worker: `rider-spot`

## 사용자 요청
1. 메인지도 `운행 시작` 버튼 상단의 `운행 준비` 텍스트 삭제.
2. 메인지도 날씨·지역·레이어 명령 바를 화면의 좌우 여백에 맞춰 가로로 확장.
3. `제보`, `도움 요청` 버튼을 지도 하단으로 내리고 균형 있게 좌·우 정렬.
4. 지도 출처 `!` 버튼을 제보 바로 위로 이동.
5. 타임라인의 `11월 22일의 이동 / 1개 운행 구간 / 이미지 저장` 상단 헤더 블록 제거.
6. 이미지 저장을 `확대` 바로 오른쪽 동일한 유형의 가벼운 액션으로 배치.
7. 기존 지도·경로·재생·저장 기능의 동작과 상태 유지.

## 구현 내용
- `src/map-timeline-layout-v4.css`:
  - 메인지도 상단 명령 바 100% 폭. 기준 390px에서 좌우 12px 여백, 실제 너비 366px. 기존 241px 대비 확장.
  - 날씨 아이콘·기온·상태와 지역 선택 및 레이어 버튼이 하나의 그리드 안에서 공간에 따라 조정됨.
  - 운행 전(`.rs34-ride-dock:not(.active)`)에만 `운행 준비` 보조 텍스트를 숨김. 운행 중 `운행 기록 중`·`운행 일시정지`는 유지.
  - 지도 액션은 하단 기준 `bottom:12px`; 지도 데이터 출처 `!` 버튼은 `bottom:81px`, `left:12px`.
  - 제보 팝업이 열리면 출처 버튼을 임시 숨김. 팝업과 출처 버튼의 z-index/클릭 영역이 충돌하지 않음.
  - 타임라인에 통합 경로가 존재할 경우 `rs11-route-first > .rs12-map-heading`을 숨김. 지도가 없는 날의 기존 내보내기 버튼은 보존.
  - 하단 이벤트/시간/확대/저장 조작부의 폰트·간격·수직 기준선 통일. 기존 재생·배속·전체 경로·슬라이더 유지.
  - 350/390px 이하의 날씨바 그리드 및 액션 버튼 반응형 처리.
- `src/map-timeline-layout-v4.js`:
  - JSX/React가 소유한 기존 저장 버튼과 onClick 함수는 변경/제거하지 않음.
  - 하루 지도 하단 `.rs12-route-actions`에 `↗ 저장` 프록시 버튼을 추가. 클릭 시 **현재 날짜에 해당하는 원본 `.rs12-recap-action`의 `.click()`을 호출**. 날짜 변경 시 같은 DOM을 다시 확인해 stale handler를 피함.
  - 기존 기능의 무단 재구현 금지. 상태/데이터 저장 코드 변경 없음.
  - React가 조작부를 재렌더하면 화면에 따라 프록시를 다시 만들도록 MutationObserver 사용. 업데이트가 Native UI에 반영되면 중복 생성하지 않도록 검사.
- `edge/rider-spot-map-timeline-layout-v4-candidate.mjs`: 운영에 실제 반영된 Worker 코드. CSS/JS는 동일 출처 경로로 제공.
- 되돌리기: `edge/rider-spot-map-credits-immediate-v3-candidate.mjs`를 동일 ASSETS/DESIGN/LEGACY 바인딩으로 운영 Worker에 재배포.

## 테스트 (실제 수행)
- Cloudflare Worker `rider-spot-urban-preview`에서 격리 테스트 후 운영에 배포.
- 모바일 390px에서 날씨 명령 바 366×56px, 360px에서 336×56px, 430px에서 406×56px 확인.
- 메인지도 `제보/도움 요청`가 아래로 이동, 출처 버튼이 제보 위쪽에 표시. 제보 메뉴 open 시 `!` 버튼 숨김 확인.
- `운행 준비` 문구 숨김(운행 중 상태 제거 아님).
- 타임라인 390px DOM/CSS 테스트: 날짜 제목 헤더 display:none; 하단 확대 버튼 x247px, 저장 버튼 x312px; 각 높이 40px, 다른 행으로 밀리지 않음.
- 저장 프록시를 실제 클릭하는 브라우저 fixture에서 기존 원본 버튼의 클릭 횟수 1 증가를 확인. 수익·지도·재생 함수를 별도로 수정하지 않음.
- 운영 Worker에 196280자 소스 업로드 성공, 운영 HTML에서 `/rider-spot-map-timeline-layout-v4.css`·`/rider-spot-map-timeline-layout-v4.js` 정상 주입.
- 운영 메인지도 렌더 결과와 기존 `unified-credits-v3`, `my-year-v5`, `bike-service-v35`, `rs-recovery-guard-v217`, `ASSETS/DESIGN/LEGACY` 연결 유지 확인.
- 테스트 Worker는 원래 5296자 스크립트 및 원래 service bindings로 원상복구.

## 실기기 확인 필요
- 실제 Android WebView의 360~430px/글꼴 확대에서 날씨바 텍스트가 잘리지 않는지.
- 운행 중 버튼 상태가 정상적으로 표시되는지.
- 타임라인의 이미지 저장 버튼이 실제 공유 카드 내보내기 흐름을 열고 이미지 저장을 완료하는지(브라우저 테스트는 클릭 위임까지만 확인).
- 확대 보기 중 저장 버튼의 모달 z-index 및 터치 반응 확인.
- 제보 팝오버, 도움 요청과 출처 팝오버 사이의 상호 작용 확인.

## 향후 배포 시 주의
메인 Worker 교체 시 두 v4 리소스 URL과 응답 라우트를 그대로 유지하거나 정식 웹 자산에 통합할 것. 화면 수정 이유로 운행 중 WebView를 강제 새로고침하거나 Leaflet 카메라/마커 anchor/route export 경로를 변경하지 말 것.
