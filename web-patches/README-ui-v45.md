# 라이더스팟 타임라인 지도 UI v45

2026-11-16 Cloudflare Worker 운영 배포 완료.

- **시간 표시 토글:** 타임라인 지도 시간 스탬프와 경로 화살표, 하단 스탬프 목록을 한 번에 표시/숨김. 현재 위치와 경로 원본은 유지
- 표시 여부는 localStorage의 `rs:route-time-stamps`에 저장. 기본 표시 ON
- Leaflet 지도 `zoomSnap: 0`, `zoomDelta: 0.25`로 세밀한 핀치 및 버튼 확대 지원
- 줌 조절은 메인 지도 및 운행 타임라인 지도의 공통 지도 구현에서 동작
- GPS SQLite 원본, Supabase 경로 저장, 지도 외곽선, OAuth, 정비, 업계 뉴스 코드는 변경하지 않음
- 스크립트는 v44 배포본에서 일회성 배포를 위한 것이며 같은 버전 반복 실행을 거부함

검증: Cloudflare 배포 성공과 재조회 시 13개 코드 및 자산 일관성 검사 통과. 실제 안드로이드 제스처 실기기 시험은 아직 미완료.

Leaflet 줌 옵션: https://leafletjs.com/examples/zoom-levels/
