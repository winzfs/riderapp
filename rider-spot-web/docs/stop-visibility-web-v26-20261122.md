# Rider Spot 정차 표시 수정 — 웹 전용 v26

- 목적: APK 수정 없이 타임라인의 정차 이벤트 및 정차 지도 마커 표시를 개선
- 적용일: 2026-11-22 (UTC+09:00)
- 운영 주소: https://rider-spot.jazzhjm.workers.dev/
- 이전 릴리스: `f98a62e74bc1`, Cloudflare Assets Worker `rider-spot-map-v25-assets`
- 새 릴리스: `dd55145c6135`, KV prefix `rs-stops-visible-v26::`
- 파일: 새 `app.mjs`(원본 minified app에 정확히 5개의 패치), 새로운 `index.html`, `sw.js`; 나머지 18개의 웹 자산은 이전 릴리스에서 바이트 그대로 복제
- 수정점: `rs:route-stop-events`/ `rs:trip-events-open` 기본값을 켬(사용자가 명시적으로 꺼둔 경우 존중); 기존 `Le?.stamps`에서 감지된 `inferred: true` 정차를 읽기 전용으로 운행 이벤트 목록·건수에 합침; 실제 `trips` 데이터와 GPS 원본은 수정하지 않음.
- 판정 한계: GPS가 기록되지 않은 정차는 추정할 수 없으며, 이 릴리스에서는 네이티브 감지 조건을 변경하지 않음.
- 배포 방식: 기존 `rider-spot` 게이트웨이와 Android 패키지는 그대로 유지. 이미 연결된 `rider-spot-map-v25-assets` 워커의 ASSETS 릴리스 지점만 `dd55145c6135`로 변경. 원본 해시를 `PREVIOUS`에 남겨 실행 중인 앱과 Service Worker가 이전 파일을 계속 읽을 수 있음.
- staging workers: `rider-spot-stops-v26-preview`, `rider-spot-stops-v26-gateway-preview`
- 자동 검증: `.github/workflows/rider-spot-stop-visibility-web-qa.yml` (미리보기), `.github/workflows/rider-spot-stop-visibility-production-qa.yml` (운영)
- 배포 전 worker version: `608d3834-9dfc-45ab-a4d3-23ab0911fb41`
- 배포 후 worker version: `54facede-2cb7-403a-9e66-5d430762f1d8`
- 주의: 롤백 시 `rider-spot-map-v25-assets` 워커만 배포 전 버전으로 복귀시키면 되고, 공유 KV 자산은 삭제하지 말 것. Android APK 및 기존 서버 테이블 변경 없음.
