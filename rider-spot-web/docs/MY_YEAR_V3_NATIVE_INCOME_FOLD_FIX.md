# RiderSpot / 나의 1년 v3 + 수익 자동수집 접기 복구
2026-11-23 · 운영 서버 `rider-spot`

## 현상과 원인
- 안드로이드 스크린샷: '나의 1년' 상단의 영문 캡션이 짙은 사각형에 덮이고 '나의 1년' 제목이 세로로 흐트러짐. 큰 연도 2026이 겹침.
- 원인: v2에서 추가한 `<header class="rs-year-hero">`, `<nav class="rs-year-controls">` 등이 앱 전역의 header/nav 스타일과 충돌. 큰 연도와 소개 문구를 한 flex 줄에 배치한 구조도 좁은 화면에서 불안정.
- 수익 탭의 '배달 수익 자동수집' 패널은 Android 애드온 `rider-spot-android/income-integration/native-income-bridge-addon.js`의 `locate()`가 `.finance-page`의 첫 자식으로 삽입. `render()`에서 최대 12개의 건별 수익 내역을 매번 펼쳐 재생성하므로 수익 제목보다 위에 길게 나타남. 이 네이티브 패널 소스에는 접기 UI가 없음.

## 수정
- 연간 히어로 `<header>`, `<nav>` 대신 독립된 `<div>` 기반 구조. 연도·이전/다음 버튼을 한 행, 제목과 설명을 그 아래 행으로 분리.
- 월간 히어로도 `<header>` 제거. 기존 Quiet Grid / 현대미술 포스터 스타일, 연간 12개월 그리드, 월간·일별 세부기능 유지.
- CSS는 `.rs-year-dialog` 범위로 한정하고 전역 header/nav 스타일을 받지 않는 안정적 레이아웃 적용.
- `auto-income-disclosure-v1.js` 도입. 네이티브 `#rs-native-income-panel-v1`을 표준 접근 가능한 `<details><summary>`로 감싸되, 원본 panel과 버튼, 데이터/네이티브 연동은 변형하지 않음.
- 수익 화면의 `.fin-subnav` 아래로 이동; 처음에는 접힘, 요약에 '수집 중' 상태와 오늘 누적 수익 표시. 클릭 시 기존 모든 컨트롤/건별 내역 그대로 표시.
- 원본 Android `render()`가 5초마다 inner panel의 자식만 재생성하므로 panel 자체를 유지하고 observer로 요약 상태만 갱신. `sessionStorage`로 접힘/펼침 선택 유지.
- 작업 대상은 웹 레이어(Worker-served script)만. APK 재설치·GPS·수익 원장 변경 없음.

## 소스
- `src/year-calendar-bridge.js`: v3 캘린더 + 추가 수익 패널 접기 초기화, 페이지에 단 한 번 주입.
- `src/year-calendar-art-v2.css`: v3 히어로 충돌 방지 레이아웃.
- `src/auto-income-disclosure-v1.js`: 독립적으로 검토 가능한 접기 모듈 원본.
- `edge/rider-spot-gateway-my-year-v3-income-fold-live.mjs`: 실제 운영 중인 Worker 정확한 소스 복사본.
- `edge/backups/rider-spot-prod-v2-before-my-year-fix-20261123.mjs`: 배포 전 운영 Worker 정확한 소스.
- CDN 버전 고정: `https://cdn.jsdelivr.net/gh/winzfs/riderapp@b59dbe3b4c6136fc78eb9c9f8f301225013a8bea/rider-spot-web/src/year-calendar-bridge.js`

## QA
- v3 JS `new Function` 구문 검증 통과.
- Cloudflare Browser Rendering: 390px Android 유사 뷰포트, 연도와 제목 bounding rect 교집합 없음, 배경 transparent, 제목 한 줄 표시.
- 격리된 preview Worker에서 `/rider-spot-my-year-v3.js`가 CDN v3와 native-fold 함수를 실제 제공함.
- 같은 미리보기에서 가상 수익/운행 데이터를 사용해 390px에서 연간 캘린더 데이터 표시, 제목 미중첩, native 자동수집 `<details>` 기본 접힘, 탭 아래 재배치 및 패널 내부 기능 DOM 유지 확인.
- Cloudflare 배포 API: 운영 Worker 업로드 성공, 기존 v1/v2 경로, 복구 가드, backend 분기, ASSETS/DESIGN/LEGACY binding 유지 확인.
- 임시 `rider-spot-urban-preview` Worker는 원래 소스와 binding으로 복원.
- 실기기 캡처/실계정 데이터 대조는 사용자가 앱을 다시 켜 확인해야 함.

## 추가 검증 / 회귀방지
- 작업 중인 라이더의 운행을 강제로 재시작하거나 WebView를 reload하지 않는다.
- 모바일 360/390/430px 및 접근성 글꼴 확대에서 연간·월간 캘린더 확인.
- 실제 네이티브 수익 자동수집이 5초마다 다시 렌더링되더라도 접힘 상태와 위치를 유지하는지 확인.
- 확장 시 자동수집 시작/중지, 접근성 설정, 새로고침, 건별 확인 버튼이 모두 정상인지 확인.
- 버전 업데이트 시 `rider-spot-my-year-v3.js` 라우트와 `src/auto-income-disclosure-v1.js` 기능을 누락하지 않도록 확인.
- 롤백: 저장된 `edge/backups/rider-spot-prod-v2-before-my-year-fix-20261123.mjs`를 기존 3개 binding으로 `rider-spot` Worker에 재배포.
