# 라이더스팟 긴급 안정화 v52

Cloudflare Worker rider-spot: 2026-11-16 17:24:28 UTC

## 증상
- 메인 지도에서 반복 축소 시 확대 배율이 다시 초기화되거나 다시 로딩되는 현상
- v50의 GPS 자동 완료 기록 병합 스크립트 배포 후 타임라인 접근이 어려워짐

## 적용
- v50 자동 완료 GPS 병합 스크립트는 HTML에서 제외하고 Service Worker 캐시에서도 제외; 저장된 GPS/서버 기록은 그대로 유지
- 안드로이드 APK(WebView에서 window.__rsNativeInstalled=true)에서 MapLibre GL 이중 렌더링을 쓰지 않고 Leaflet의 기본 OpenStreetMap 타일 렌더링을 사용 (모바일 렌더링 안정성 우선)
- 메인 지도와 운행 지도 모두 현재 중심·줌을 sessionStorage 및 localStorage에 저장; React 컴포넌트 재생성 시 복원
- 복원된 메인 지도에는 최초 GPS auto-center를 중복 적용하지 않음; 명시적으로 누르는 현재 위치 버튼은 정상 동작
- 웹/PWA에서는 기존 MapLibre를 계속 사용, 렌더링 오류 재현 시 추가 원인 추적 필요
- 기존 GPS SQLite, Google OAuth, 도로 보정, 타임라인 데이터 원본 및 커뮤니티 DB는 수정하지 않음

## 검증
- Cloudflare PUT 배포 및 GET 재조회 코드 보존 검사 13개 통과
- Cloudflare Browser Rendering의 별도 일반 브라우저에서 v52 첫 페이지가 정상 렌더링되는 것을 확인
- 실제 Galaxy S24+ WebView에서 확대·축소 및 완료된 운행 타임라인의 무중단 진입은 아직 검증되지 않았음

v50 문제는 사용자 기기의 실제 Chrome devtools 크래시 로그가 없어 원인 확정은 아님. 자동 반복 병합이 성능 문제를 일으킬 가능성에 대응한 방어적 임시 비활성화.
기존 APK에 들어 있는 기본 완료 기록 병합은 여전히 동작하며, 로컬 기록 삭제·앱 재설치를 요청해서는 안 됨.
원본 코드 발췌: web-patches/rider-spot-map-v52-excerpt.js
공식 MapLibre binding 참고: https://github.com/maplibre/maplibre-gl-leaflet
