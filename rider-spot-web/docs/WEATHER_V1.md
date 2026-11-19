# 라이더스팟 날씨 v1 — 운영 메모 (2026-11-19)

## 기능
- 지도 필터 아래 35px 날씨 HUD: 시간별 예보 기반 기온·날씨·강수 주의 문구
- 탭 시 상세 패널: 6시간 예보, 시간별 강수량, 풍속, 습도, 제공처 표시
- 위도·경도는 날씨 격자(0.05도)로 반올림해 요청. 실측 GPS 세부 좌표는 날씨 제공사로 보내지 않음
- React 지도와 운행·타임라인 처리 구조는 변경하지 않음
- 위치 미확보 시 지도 중심 좌표 사용. 위치 정보가 없거나 예보 연결 실패 시 임의 값을 만들지 않고 날씨 확인 안내
- 화면 메모리/세션 스토리지에 예보를 보존하고, 탭 이동 중 중복 요청 방지

## 데이터 제공사 및 라이선스
- 기상청 서비스 키가 기존 운영 환경에 없어 초기 구현은 **MET Norway Locationforecast 2.0** 사용
- URL: https://api.met.no/weatherapi/locationforecast/2.0/compact
- 제공사: Norwegian Meteorological Institute / CC BY 4.0. 상업적 이용 가능하며 저작자 표시 의무
- 북유럽 외 지역의 예보 갱신 주기가 최대 6시간 단위이므로 초단위 강수 예측이나 실황이라고 안내하지 않음
- 정식 기상청 키를 발급하면 API 프록시만 교체 가능 (화면 구성은 유지)

## 배포
- Worker: rider-spot / https://rider-spot.jazzhjm.workers.dev
- 운영 배포 시각: 2026-11-19T06:29:00Z
- 운영 버전: 208 / 58dd2cda-de43-4c72-af22-eb91725bf0dc
- 이전 버전: 207 / b1714f65-43c6-4cb9-bef2-20095b2640d9
- 새로운 엔드포인트: GET /api/weather?lat=35.19&lon=126.83
- 정적 자산: /assets/rider-weather-20261119/weather-bar.js /weather-bar.css
- 웹 자산은 기존 운영 Worker의 맵/인증/지도/이용자 경로를 그대로 두고 추가함
- 오프라인 PWA 캐시 버전: rider-spot-shell-weather-20261119

## 소스
- src/weather-proxy.mjs : 서버 라운터에 넣을 예보 프록시 소스
- src/weather-bar.js : 지도 UI, 상태 갱신, 상세 예보
- src/weather-bar.css : 날씨바/상세 UI와 기존 지도 컨트롤 최소 정돈
- scripts/build.mjs : 후속 정식 웹 빌드에 날씨 정적 자산 포함
- tests/weather-proxy.test.mjs : 입력/정규화/좌표 반올림 테스트
- .github/workflows/rider-spot-weather-build.yml : 날씨 자산 CI 빌드

## 중요한 배포 주의사항
다른 작업자가 운영 Worker를 새 소스 파일에서 재구성할 때 기존 `/api/weather` 라우트를 반드시 유지해야 한다. 단순히 `weather-bar.js` 파일만 새 릴리스에 포함하면 요청은 404가 된다. 이 코드는 208 버전에 포함되어 있으며, 서버 라우트 소스는 `src/weather-proxy.mjs`가 기준이다. 차기 Worker 이미지 병합 또는 릴리스 시 소스의 `rsHandleWeather` 구현과 라우트를 유지한다.

검증: GitHub Node 테스트 및 앱 번들 빌드 성공. Worker 208 Version URL에서 /api/weather 응답 수신, Chrome 모바일 렌더링에서 HUD 표시 및 테스트용 위치로 실시간 텍스트 갱신 확인. 운영 트래픽 100% 전환 후 배포 버전 API 확인 완료.

날씨 정보만 사용하며 위치 공유 설정, 운행 로그, 커뮤니티 DB, 바이크 기록, 수익 기록은 변경하지 않는다.

## 2026-11-19 재배포 / APK WebView 갱신 문제
- 설치형 Android WebView는 `MainActivity.java`에서 첫 생성 시에만 `webView.loadUrl(HOME)`를 실행하며, `onResume`에는 기존 문서 재사용(`webView.onResume()`)만 한다. 이전 화면을 실행 중이면 서버 배포만으로 현재 DOM을 새로고침하지 않는다.
- 앱 최초 생성 또는 강제 중지 후 재실행하면 최신 HTML을 요청한다. **앱 데이터 삭제는 금지** (운행 기록 보존).
- 캐시 완화 버전 209: `f72e41b7-a7a1-47e8-936b-53fef648b8fa`, 운영 100%, 이전 208 `58dd2cda-de43-4c72-af22-eb91725bf0dc`. 루트(/), /index.html, /sw.js에 Cache-Control: no-store로 변경하여 WebView/프록시 HTML 캐시 잔존 가능성 완화.
- 운영 209에서 모바일 브라우저 렌더링 테스트로 `#rs-weather-hud` 및 날씨 JS/CSS 정상 로딩을 확인함. 다만 실제 사용자 휴대폰 WebView 내부 상태는 원격 확인 불가.
- 향후 배포 때 no-store 헤더와 `/api/weather`를 유지해야 하고, Android 앱을 단순히 백그라운드에서 복귀시키는 행위만으로 새 웹 코드가 자동 적용된다고 안내하지 말 것.
