# RiderSpot — 타임라인 지도 / 조작부 디자인 개선 v1
운영 반영일: 2026-11-23  
운영 서비스: Cloudflare Worker `rider-spot`

## 1. 목표와 범위
타임라인의 하루 통합 경로 지도와 개별 운행 지도에서 기본 Leaflet 조작부의 이질감을 줄이고 RiderSpot의 블루·화이트·웜그레이 톤과 일관된 카드/재생 패널을 제공한다.

지도 경로, GPS, 출발/종료 위치, 재생 상태, 수익 데이터, 운행 종료, 이미지 내보내기 기능의 작동 논리는 수정하지 않는다.

## 2. 적용 사항
- **출처:** 지도 최초 노출 시 기존 Leaflet/OpenFreeMap/OpenMapTiles/OpenStreetMap 등 출처를 5초간 그대로 제공한다. 이후 지도 좌하단의 `ⓘ 출처`로 축소하며, 누르면 지도 제공자가 넣은 원본 출처 링크를 그대로 복제한 작은 팝오버 표시. 바깥 터치, Esc로 닫기 가능. Attribution 없는 지도에는 축소 버튼을 만들지 않으며 원본 표기를 건드리지 않음.
- **지도 줌:** 우상단 +/- 버튼을 단일 라운드형 화이트 스택으로 통일. Leaflet의 버튼 이벤트 및 지도 카메라 상태는 그대로.
- **지도 헤더:** 제목·운행 구간 안내·저장 버튼의 간격/폰트/테두리 정리. `이미지 저장`은 시각적으로 `↗ 저장`으로 축약하고 aria-label과 기존 이미지 생성 핸들러 유지.
- **경로 재생:** 재생·일시정지, 10~100배 배속, 전체 경로를 하나의 3열 컨트롤 라인으로 정리. React 컴포넌트/핸들러 변경 없음.
- **슬라이더:** 4px 트랙, 16px 손잡이, 42px 터치 영역, 진행 시간 우측 정렬. 재생 위치 값은 네이티브 range 그대로 사용.
- **보기 설정:** 이벤트/시간을 가벼운 segmented 컨트롤로 정리, `크게`는 시각적으로 `확대`로 표기. 확대 시 `닫기`로 표시. 도로 보정 메뉴는 그대로.
- **마커:** 시작/종료 레이블, 시간 말풍선의 패딩·글꼴·그림자만 소폭 축소. Leaflet 마커의 위치/앵커/transform은 수정하지 않음.
- **반응형:** 390px 미만 폭에서도 플레이어 버튼 한 줄 유지, reduced-motion 환경에서 불필요한 전환 제거.

## 3. 구조와 소스
- `src/timeline-map-polish-v1.css`: 모든 시각 요소를 `.app .rs33-timeline`, `.app .rs33-trip-detail` 내부로 한정하여 기존 전역 스타일과 충돌 방지.
- `src/timeline-map-polish-v1.js`: 별도 의존성 없는 출처 접근성 모듈. 앱 화면이 전환되면 필요한 지도에만 노출하며 리렌더링 중에도 루트 지도 컴포넌트는 변경하지 않음.
- `edge/rider-spot-timeline-controls-v1-candidate.mjs`: **운영 서버에 업로드한 정확한 Worker 소스(110,686자)**. 기존 HTML 삽입에 CSS+JS만 추가하며 두 URL `/rider-spot-timeline-polish-v1.css`, `/rider-spot-timeline-polish-v1.js`는 동일 출처에서 정적으로 제공.
- `edge/backups/rider-spot-prod-before-timeline-polish-20261123.mjs`: 배포 직전의 정확한 Worker 백업(89,977자). My Year v5와 Bike service v35 포함.
- 기존 `/rider-spot-my-year-v5.js`, `/rider-spot-bike-service-v35.css`, 본래 UI 번들 및 `ASSETS`/`DESIGN`/`LEGACY` 서비스 바인딩 그대로.

## 4. 법적 출처 표시
OpenStreetMap Foundation의 Attribution Guidelines(https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)에서 지도 출처를 표시한 후 5초 경과 시 접는 방식과 접근 가능한 (i) 링크를 허용하는 범위를 참고했다.
OpenMapTiles(https://openmaptiles.org/docs/terminology/attribution/)의 링크 접근 요구를 충족하기 위해 원본 제공자 링크를 팝오버에서 그대로 보여준다.
출처를 삭제하지 않으며 실제 지도 제공자 구성에 따라 원본 링크 내용은 동적으로 달라진다.

## 5. 실제 수행 QA
- Chrome 모바일 390px 브라우저 미리보기에서 3열 재생 패널 `201px / 65px / 72px` 확인.
- 5초 경과 후 원래 Leaflet 출처가 축소되고 작은 `ⓘ 출처` 버튼이 나타나는 것 확인.
- 버튼 터치 후 원본 OpenStreetMap 저작권 URL 및 링크 표시 확인.
- `↗ 저장` 시각적 버튼 라벨과 기존 aria-label 유지 확인.
- 격리된 Worker `rider-spot-urban-preview`에서 앱 초기 로딩, 새 CSS/JS, My Year v5, Bike service v35, 기존 앱 해시 및 복구 가드 확인.
- 운영 Worker 업로드 API 성공. 운영 웹 루트에서 CSS/JS URL, My Year v5, Bike service v35, 앱 해시, 복구 가드, 기존 서비스 바인딩 유지 확인.
- 격리 미리보기 Worker는 기존 5,296자 소스 및 자산 바인딩으로 원상복구.
- **현장 실기기 운행 데이터 및 실제 경로의 재생/이미지 저장은 아직 직접 테스트하지 못함.** 기능 로직을 수정하지 않았다는 점과 실제 동작 검증 완료를 혼동하지 말 것.

## 6. 업데이트와 롤백
- 메인 배포 Worker를 추후 덮어쓸 때 동일 출처 CSS/JS 라우트를 유지하거나 웹 빌드 소스에 정식 통합할 것.
- 폴백/롤백: `edge/backups/rider-spot-prod-before-timeline-polish-20261123.mjs`에 저장된 Worker를 기존 `ASSETS`, `DESIGN`, `LEGACY` 바인딩과 동일한 compatibility_date로 재배포.
- 앱 실행 중 자동 강제 새로고침 금지. 앱 완전 종료 후 재시작 시 새 CSS/JS 반영 확인.
