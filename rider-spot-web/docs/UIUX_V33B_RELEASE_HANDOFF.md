# RiderSpot v33b 배포·검수 인계 기록 — 2026-11-23 KST

## 확인된 배포 기준
- 소스 작업 브랜치: `design/mobile-layout-v32`, HEAD `b1d354ef516fb3cff296d60402ec0700b211b015`.
- UI/UX 통합: PR #30 (merged), 수익 건별 내역: PR #31 (merged). 두 PR 모두 위 작업 브랜치에 병합되었으며 기본 `main` 병합으로 혼동하지 말 것.
- 웹 릴리스 자산 해시: `f6627988c229` (`rider-spot-web/prebuilt/release.json`).
- 운영 엔드포인트: https://rider-spot.jazzhjm.workers.dev/
- Cloudflare `rider-spot` Worker: 2026-11-22 18:41:39 UTC에 version `bd39aa8d-16e1-48e2-9cbf-207a9862d0e4` 100% 배포됨.
- `rider-spot-curated-v9-assets` Worker 자산 마지막 수정: 2026-11-22 18:55:46 UTC.
- 미리보기: 신규 Worker 생성은 100개 제한과 충돌할 수 있어 `rider-spot-atelier-v8-preview` 기존 Worker 사용 (마지막 수정 18:52 UTC). 검증되지 않은 운영 Worker 덮어쓰기 금지.

## 자동 검증 근거
- v33 native 통합 회귀: https://github.com/winzfs/riderapp/actions/runs/45056584865 — success
- v33 라이브 미리보기: https://github.com/winzfs/riderapp/actions/runs/45056235656 — success
- v33 운영 acceptance: https://github.com/winzfs/riderapp/actions/runs/45056545950 — success
- v33b 라이브 자동수익 미리보기: https://github.com/winzfs/riderapp/actions/runs/45057518366 — success
- v33b 운영 acceptance: https://github.com/winzfs/riderapp/actions/runs/45057845156 — success
- v33b 웹 단위/통합 검증: https://github.com/winzfs/riderapp/actions/runs/45057849581 — success

자동 검증에는 운영/미리보기 HTTPS 파일 응답, 13개 해시 자산, 서비스 워커 릴리스 해시, 과거 자산 호환, 5개 탭/브라우저 탐색, 모의 계정의 수익/기록 CRUD, 한국 업무일 경계(03:00), Android 뒤로가기가 포함된다. 실제 데이터 또는 휴대폰에서의 모든 상호작용 통과와 동일시하지 않는다.

## 네이티브 APK 상태
- 통합 디버그 APK GitHub Actions: https://github.com/winzfs/riderapp/actions/runs/45056584865
- artifact: `RiderSpot-UIUX-v33-Integrated-APK` (ID 14768070434), 만료: 2026-12-06 18:43 UTC.
- 압축 해제 파일: `RiderSpot-UIUX-v33-Integration-Debug.apk` (2,663,986 bytes).
- SHA-256: `302fae4553c8affacce0f71b9f559a45445e149c4652a8e7fabd2597c3f12b0c`
- ZIP 무결성, APK ZIP 무결성, SHA-256 대조 통과. GitHub workflow에서 `apksigner verify` 성공.
- APK `assets/native-bridge.js` 안에 이미지 저장 브리지, 수익 연결, 체크포인트, 위치/GPS 관련 코드 문자열이 들어 있음.
- 위 APK는 **debug 서명**이다. 기존 설치본과 서명 인증서가 다르면 업데이트 설치 불가. 기존 데이터 손실 위험 때문에 먼저 앱을 지우지 말고 서명/백업을 확인할 것.
- 이 APK는 PR #30 통합 네이티브에서 생성되었고 PR #31의 추가 **웹 수익 기록 컴포넌트**는 운영 원격 Worker에서 제공된다. 네이티브 로컬 빌드가 PR #31의 웹 변경을 파일에 내장한 것은 아님.

## 남은 현장 검수 (통과로 표시 금지)
1. Galaxy S24+ / Android 17 설치·서명·교체 가능 여부, 접근성 권한 유지 및 권한 재설정.
2. 앱 5탭/수익 4하위 탭에서 회전, 320~412px, 130/200% 글자, 분할화면, TalkBack, 모션축소.
3. 위치·날씨·제보·SOS·출처 겹침, 지도 핀 pan 동기화.
4. 실운행 GPS 시작/정지/종료 저장·재시도·서버 반영 및 시작/종료 마커와 PNG 결과.
5. GPS 빈 구간·근접 출발/종료·다중 운행·재생·경로 확인, 서버/앱 재접속 복구.
6. 쿠팡이츠/배민 실제 접근성 수익 자동인식(중복, 0/1/12/13건, 시각, 03:00 KST 날짜 경계), 실제 서버 기록.
7. 월말 목표 특이값, 장부 수익/비용 중복 집계 방지, 정산 수정/취소.
8. 내 바이크 계기판·3×2 정비·주유 원본 연결, 동네 글 작성/수정/사진/댓글·뒤로가기.
9. 이미지 저장/갤러리 권한과 취소·저장 실패·공유 경로.
10. 정식 서명 릴리스 APK의 빌드/설치/기존 설치본 업데이트 검수. 현재 위 통합 APK는 debug용이다.

## 작업 원칙
기능 제거 또는 기존 GPS, 자동수익, 재생/저장, 사용자 데이터 수정 금지. 현장 검수 결과가 없으면 완료로 선언하지 않는다. 운영 자산을 변경할 때는 동일 해시 기준 staging → regression → production 순서로 검증하고, 새 Worker 생성보다 기존 Worker 재사용을 우선 검토한다.
