# 라이더스팟 타임라인 배율 재설정 핫픽스 v49

운영 서버 배포: 2026-11-16 16:53:17 UTC, Cloudflare Worker rider-spot

## 원인
v48의 카메라 복원 뒤에도 자동 위치 이동 effect가 setView([e.lat,e.lng], 16)을 호출했으며, 컴포넌트 재생성 시 축소 배율을 덮어썼습니다.

## 배포한 수정
- 타임라인 상세 지도에 대해서만 초기 자동 위치 이동을 건너뜀; 일반 지도 최초 현재 위치 이동은 유지
- Leaflet 지도 생성 전에 sessionStorage의 기존 중심점/줌을 읽어서 처음부터 그 배율로 생성
- 지도 moveend와 zoomend에서 카메라 저장, 컴포넌트 언마운트 직전에도 저장
- minZoom 7.5, maxZoom 19, zoomSnap 0, zoomDelta .25 유지
- 메인 앱 JS 버전 v49와 Service Worker 캐시 v49로 교체
- SQLite GPS 및 서버 운행 데이터, OAuth, 도로 보정, 시간 토글, 지명 라벨 기능 유지

재배포 코드 자체 및 운영 Worker 재조회 검사 11개 항목 통과.
실기기에서의 반복 축소 테스트는 검증하지 못했으므로 완전 해결은 사용자 기기 확인 필요.

추후 실제 사용자 기기에서 또 발생하면 지도 마운트 횟수, WebGL 콘텍스트 손실, leaflet map 이벤트·React 재생성 여부와 GPU 메모리 부담을 진단.
참고: https://github.com/maplibre/maplibre-gl-leaflet