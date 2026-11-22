# RiderSpot UI/UX v34 — 실제 화면 개편·운영 반영 보고서
기록일: 2026-11-23 KST

## 목적
v33이 색상/간격 중심으로 변경되어 기획안 대비 눈에 띄는 화면 구조 개선이 부족했던 문제를 해결한다. 이번에는 기존 API와 GPS·수익·정비 데이터 저장 로직을 유지하면서 5개 화면의 **실제 React DOM 정보 순서**와 조작 진입점을 재설계하였다.

## 변경 전후
| 화면 | 이번 변경 (실제 컴포넌트) |
|---|---|
| 수익 | 상단 수익 요약 → 남은 근무일의 하루 목표 → 빠른 입력 → 7일 그래프 → 접을 수 있는 플랫폼별 합계 순서로 재구성. 목표가 그래프 아래에 묻히던 문제 해소. 장부 조회·저장 원본 유지. |
| 타임라인 | 날짜 선택 → 하루 GPS 경로 지도 → 수익/거리 요약 → 운행 목록 순서로 변경. 상단 운행 버튼은 현재 운행이 있으면 기존 `finish()` 호출하는 ‘운행 종료’로 바뀜. GPS 마커·재생·PNG 경로 생성 유지. |
| 동네 | 카테고리 칩을 ‘검색·필터’ 접힘 패널 **밖으로 실제 DOM 이동**. 카테고리 즉시 선택 가능. 본문과 이미지 밀도 정비. 글쓰기·댓글·신고·좋아요 저장 변경 없음. |
| 내 바이크 | 계기판 수치 옆 직접 수정 진입, 차량 설정 중복 제거, 정비 주의 건수, 정비 3×2 타일, 정비 이력 밀도 정비. 소모품 주기·기록 원본 유지. |
| 지도 | 지도 조작 영역 유지, 운행 상태·시작/종료를 하단 하나의 조작 레일로 묶음. 실제 위치 공유·제보·SOS 액션 변경 없음. |
| 공통 | 밝은 그레이·화이트·절제된 블루/청록 팔레트, 새로운 레이아웃 위계, 인터랙션 크기·타이포·반응형, 키보드 포커스와 모션 축소. 기존 5탭 유지. |

## 코드 위치
- `rider-spot-web/src/application.mjs`, `Timeline.mjs`, `finance-ui.mjs`, `mobile-records.mjs`: 실제 컴포넌트/정보 순서 수정
- `rider-spot-web/src/curated-v9.css`: `RIDERSPOT V34 REARCHITECTURE` 스코프
- `rider-spot-web/tests/uiux-v34-browser.cjs`: 320·360·390·412px 5탭·바이크 3×2·동네 카테고리·가로 넘침 검증
- `rider-spot-web/tests/mobile-records-browser.cjs`: 접히는 플랫폼 수익 상세를 열어 확인하도록 실제 새 흐름에 맞춰 회귀 테스트 갱신
- 통합 PR: https://github.com/winzfs/riderapp/pull/32 (merged to `design/mobile-layout-v32`)
- 검증된 immutable hash: `82c20b027c23`
- 검증된 frozen artifact commit: `20e2fe649866c3ecb1fc47d3f5fee154a81fe543`

## 테스트 결과
1. 전체 180개 Node 단위·통합 테스트, ES module 문법, immutable asset esbuild: 성공. https://github.com/winzfs/riderapp/actions/runs/45061290615
2. 13개 해시 자산 + HTML/SW freeze: 성공. https://github.com/winzfs/riderapp/actions/runs/45061529680
3. Cloudflare 기존 preview ASSETS gateway `rider-spot-atelier-v8-assets`에서 v34, 이전 v33b 자산과 네이티브 가드, live 5탭 4폭, 모의 로그인 CRUD·뒤로가기: 성공. https://github.com/winzfs/riderapp/actions/runs/45061685896
4. 실제 운영 `rider-spot.jazzhjm.workers.dev`의 v34 HTML/SW/hash 13 자산 + 3개 과거 자산, 5탭 4폭, 계기판·수익·정비 저장 회귀/뒤로가기: 성공. https://github.com/winzfs/riderapp/actions/runs/45061992971

## 운영 적용 범위
- 운영 주소: https://rider-spot.jazzhjm.workers.dev
- 변경한 운영 Worker: `rider-spot-curated-v9-assets`, 현재 배포 version `0ef894db-ab05-4076-910a-8154d084bd18` (2026-11-22 19:39:13 UTC)
- **변경하지 않은** 메인 `rider-spot` Worker: version `bd39aa8d-16e1-48e2-9cbf-207a9862d0e4`. API backend/Google 로그인/라이딩 저장 경로 변경 없음.
- 미리보기 asset gateway: `rider-spot-atelier-v8-assets` version `66483c06-1c84-4b9b-9d1a-7900e1bfde6b`.
- v33b `f6627988c229`는 PREVIOUS 목록에 키 `rs-uiux-v33b::`로 보관하여 기존 WebView가 구버전 JS/CSS를 읽을 수 있다.
- 현재 버전의 static shell/JS/CSS는 `rs-uiux-v34::` 키와 고정된 GitHub raw commit로 제공. 기존 KV map data와 저장 데이터는 변경하지 않았다.

## 남은 실제 기기 검수 (자동 테스트와 구분)
- 삼성 Android 17 실제 설치본 WebView 캐시/서비스 워커 갱신. 앱 실행을 종료 후 재실행해 신 디자인이 적용되는지 확인.
- GPS 실제 운행 시작·일시정지·종료·서버 보관, 출발·종료 마커, 2회 운행 결산 PNG 갤러리 저장.
- 쿠팡이츠/배민 접근성 권한 및 금액 자동 기록, 중복·업무일 03:00 KST 경계.
- TalkBack 130/200% 글자, 시스템 분할 화면, 단말 네트워크 끊김/복귀와 다중 단말.
- 정식 서명 APK 재빌드·업데이트 설치는 이번 **웹 자산 릴리스의 검증 범위 밖**. 앱 설치 파일을 새로 배포했다고 기록하지 않는다.

## 문제가 생기면
- Cloudflare에 보존된 운영 ASSETS 이전 배포 version `73b28aaf-0a2d-448d-b12f-ca2be6f378cb`를 복원하거나 원래 pinned `f6627988c229` gateway를 다시 올릴 수 있다. 정적 자산 되돌림은 데이터베이스의 수익/운행 기록을 되돌리지 않는다.
- 실제 휴대폰에서 저장/경로/수익 기록 회귀가 나타날 경우 새 디자인 자산만 롤백하고 먼저 기존 데이터 보존 상태를 점검한다.
