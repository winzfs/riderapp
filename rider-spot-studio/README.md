# Rider Spot Studio — 격리형 운영·검증 콘솔

이 폴더는 **라이더스팟 운영 서비스와 분리**된 테스트용 웹 작업 공간입니다.

- 앱 운영: `https://rider-spot.jazzhjm.workers.dev/`
- 콘솔 Worker: `rider-spot-studio`
- 앱 개발 브랜치: `feature/rider-spot-native-apk`
- 콘솔 브랜치: `feature/rider-spot-studio`
- Supabase 프로젝트: `rider-spot` (ap-northeast-2)
- **접근 범위: `public.rider_spot_studio_records`에만 쓰기.** 원본 `trips`, `posts`, `rider_earnings`, `maintenance_logs`는 수정하지 않음.

## 구성

`index.html`, `studio.css`, `studio.js`는 빌드 단계 없이 Cloudflare Worker 정적 응답으로 배포할 수 있는 웹 자산입니다.

| 메뉴 | 기능 |
| --- | --- |
| 대시보드 | 테스트 객체·미해결 버그·QA 통과 수 · 라이브 앱 링크 |
| 지도 | 광산구 가상 라이더의 위치/상태/공개 수정 · Leaflet 배율 유지 점검 |
| 타임라인 | GPS 좌표 편집 · 매시 정각/정차 마커 토글 · 1/10/20/30/100배 경로 재생 |
| 커뮤니티 | 테스트 게시글 CRUD · 동네글/자유글/업계소식 카테고리 |
| 수익 | 운행 종료 직후 수익 입력 진입 · 플랫폼별 CRUD와 합계 |
| 내 바이크·정비 | 단일 진입 · 계기판 · 부품 아이콘 · 마지막 교환 거리 · 팝업 이력과 CRUD |
| QA | 모바일/Android WebView/실서비스별 테스트 결과·메모 관리 |
| 버그·배포 | 상태·재현 단계·최신 버전·실제 검증 결과 기록 |
| 디자인 | 색상·컴포넌트·모바일 미리보기·화면별 제약 비교 |
| 인프라 | Supabase RLS 구조, Cloudflare 배포 스냅샷, 앱/네이티브 모듈 경계 |

## 데이터 보호

1. 로그인 전 테스트 데이터는 **해당 브라우저 localStorage**에만 보관됩니다. 첫 시작에 광산구 *가상* 라이더·게시글·운행·수익·정비 샘플이 생성됩니다.
2. 라이더스팟 Supabase 계정으로 로그인하면 `rider_spot_studio_records`의 **본인 소유 행만** 확인·추가·수정·삭제합니다. 서버에 샘플을 자동 업로드하지 않습니다.
3. 출입을 제한하려면 별도 Cloudflare Access 정책을 적용하세요. 현재 웹 URL 자체는 비공개 로그인 시스템이 아니며, **쓰기 작업만 Supabase Auth/RLS로 제한**합니다. 개인정보·실제 위치를 테스트 레코드에 넣지 마세요.
4. 내보내기/가져오기: JSON으로 개인 데이터 백업. 업로드는 수동 확인이 필요합니다.
5. 위젯 지도와 타임라인은 **독립 시뮬레이터**입니다. 여기서 통과한 테스트는 운영 앱의 기능이 통과했다는 뜻이 아닙니다. 운영 검증은 실제 앱에서 확인하고 QA 항목에 직접 기록하세요.
6. 지도는 OSM 일반 타일을 사용하므로 부하 테스트에는 사용하지 마세요.

## 검증

- GitHub에서 `studio.js`를 내려받아 `node --check studio.js`로 구문 검사.
- HTTP `/`, `/studio.css`, `/studio.js`, `/__health` 확인.
- Chrome 기기 에뮬레이션 360×400, 412×892에서 탭 이동, 입력 키보드, 시트 모달, 메뉴, 스크롤 확인.
- Android WebView에서 폰트, 외부 CDN 및 지도 타일 연결, 핀치 줌과 뒤로가기 확인.
- 로그인/로그아웃 · 서버 데이터 CRUD · 타 사용자 간 RLS 거부를 확인(동일 계정 테스트만으로 격리 검증 완료로 간주하지 않음).
- 운영 링크는 변경되지 않았으며 이 콘솔 배포가 실제 앱을 수정하지 않습니다.

## 실제 Worker 배포 정보 (2026-11-18 확인 시점)

- Worker `rider-spot`
- v180 관련 배포 ID `90213b9d-1124-4576-8f24-2acc8654532f`
- version ID `4cb4d994-6161-4230-b0d9-40f30192e3b9`
- 배포 로그의 QA 통과 언급은 실기기 확인과 구분하여 기록.

## 네이티브 전환 모듈

- 지도/카메라: `src/map-controller.mjs`, `src/RiderMap.mjs`
- 타임라인/재생: `src/Timeline.mjs`, `src/route-playback.mjs`
- GPS/로컬 보관: `src/native-gps.js`, `src/native-trip.mjs`, `src/trip-storage.mjs`
- 정비/수익: `src/mobile-records.mjs`, `src/maintenance-model.mjs`
- Android WebView 브리지: `rider-spot-android`, `src/use-ride.mjs`

**중요:** 콘솔의 UI는 별도 제품이며 실앱 내 정비 메뉴가 통합되었다는 증거가 아닙니다. 실앱 변경은 앱 브랜치에서 별도 테스트/배포가 필요합니다.
