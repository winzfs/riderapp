# 라이더스팟 지도·날씨 디자인 v212 (2026-11-19)

## 운영 버전
- Cloudflare Worker: rider-spot
- URL: https://rider-spot.jazzhjm.workers.dev/
- 배포: **212** `5ff9b4ad-a719-4ea1-9f9a-38f55ec98e4a`
- 직전 안정 버전 / 롤백: **209** `f72e41b7-a7a1-47e8-936b-53fef648b8fa`
- 검증된 CSS 경로: `/assets/rider-weather-ui-v211/polish.css`
- 관리용 CSS 소스: `rider-spot-web/src/map-weather-polish-v211.css`

## 배경
- v210에서 PWA 캐시와 map-reports.js, weather-bar.js까지 동시에 교체했을 때 Android 앱의 반복 페이지 새로고침 제보가 발생했다.
- v209로 롤백한 후 사용자가 새로고침이 멈췄다고 확인했다.
- 이후 v210 CSS 패치만 다시 붙이면 안 된다. 특히 **v210의 SW 캐시 변경 코드 / map-reports 교체 코드 재도입 금지**.

## v212 구현 방식
- v209의 정확한 HTML/JS/SW 구성을 유지한다.
- HTML `</head>` 앞에 유일한 CSS link 한 개만 삽입:
  `<link rel="stylesheet" href="/assets/rider-weather-ui-v211/polish.css">`
- 해당 경로에서 CSS 제공. 별도 JS 변경, SW 교체, 페이지 강제 reload 없음.
- **주의** Cloudflare `GET /workers/scripts/rider-spot`는 현재 배포된 버전이 아니라 최신 업로드된 코드를 반환할 수 있다. 배포 버전과 소스 조회 버전을 반드시 구분할 것. v212는 기존 업로드 소스에서 `/* RIDER_SPOT_UI_V210_20261119 */` 블록 전체를 제거하고 v211 CSS-only 패치만 유지해 생성했다.

## 고친 UI
- 날씨 상세의 HTML `header`가 레거시 글로벌 스타일에 의해 큰 짙은 사각형이 되던 문제를 **날씨 전용 CSS 선택자**로 해결. 기본 날씨 JavaScript는 그대로 유지.
- 닫기 버튼과 제목·예보 기준시각의 간격 조정.
- 온도 강조, 풍속·습도·강수량 카드, 시간별 예보 그리드, 출처 문구 간격/서체 정리.
- 지도 상단 지역명/공유 칩/카테고리 버튼/날씨바의 높이 축소·통일.
- 지도 위 GPS/내상태/SOS/줌/현재위치 버튼의 시각적 체계 통일.
- 화장실 마커 약간 축소, 공공 화장실 수량에 구분 표시 추가. OSM 출처 링크 유지.
- 운행 시작 및 기록 중 버튼 폭을 동일하게 맞춤. 클릭/운행 로직은 그대로 유지.

## 확인 결과
GitHub Actions `Rider Spot v212 safe CSS-only production preview`의 정적 비교 테스트에서 다음 파일이 **원본 v209와 v212에서 정확히 동일**한 것으로 확인됨:
- /index.html (신규 CSS link 1개만 차이)
- /sw.js
- /pwa-init.js
- /assets/rider-spot-c2447071d7bb/app.mjs
- /assets/rider-spot-c2447071d7bb/map-reports.js
- /assets/rider-weather-20261119/weather-bar.js
- /assets/rider-weather-20261119/weather-bar.css

Cloudflare 모바일 브라우저 렌더링에서 운영 v212의 날씨 HUD + 신규 CSS link + v209 날씨 JavaScript 경로가 모두 표시됨. v210 지도/날씨 자산은 로드하지 않음.

## 운영 주의
- 기존 Android 운행 기록/GPS/IndexedDB/쿠키/로그인/서비스 워커 저장소를 직접 지우지 않는다.
- 다음 정상 빌드 시 v212 CSS를 누락하지 말 것. 반대로 v210 SW 수정은 포함하지 말 것.
- 문제가 생기면 앱 데이터를 삭제하는 대신 Worker 배포를 v209로 롤백한다.
