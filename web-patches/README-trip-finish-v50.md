# 라이더스팟 운행 종료 GPS 병합 문제 v50

2026-11-16 Cloudflare Worker 운영 배포 완료.

## 버그 원인

웹앱은 `Ko(ne, records)`를 사용해서 `rs:trips:<user-id>`에 저장하지만 Android v1.0.6의 내장 `finalizeNativeTrip`는 접두사 `rs:`가 없는 `trips:<user-id>`에서 완료된 운행을 찾았음.
따라서 기기에 실제 SQLite 좌표가 수천 개 저장되어도 `기기의 완료 기록을 찾지 못했어요` 오류가 발생.

## 웹 업데이트(기존 APK 유지)

- React 운행 종료 함수: `rs:trips:<uid>` 저장 직후, 네이티브 환경에서만 `trips:<uid>` 미러를 작성해 기존 APK 병합 코드와 연결
- 기존 v42 GPS 읽기 모듈이 `__rsGPS42NativeRead` 인터페이스를 내보내도록 수정
- 새 `rider-trip-finalize-v50.js`: `state.lastStoppedId`로 종료된 운행만 확인하고 SQLite `points`를 읽어 기존 완료 메타데이터와 병합
- 기존 완료 메타데이터 없이 무조건 완료된 운행을 만들지 않으며, 기록과 무관한 다른 운행을 변경하지 않음
- SQLite 위치 샘플을 삭제하지 않음. 서버로는 완료된 운행만 전송하고, 네트워크 오류 시 기기에 저장 후 `rs:pending:trips:<uid>`에 재전송 대기
- 정차 이벤트 등 기존 기기 이벤트와 정확도를 우선 병합; 타임라인의 `riderspot:native-events` 갱신
- HTML 자산/서비스워커 캐시 v50 갱신

## 검증

자동화 테스트 5개: 정상 기록 복구, 진행 중 업로드 방지, 완료 기록 부재 시 임의 생성 금지, 오프라인 대기, 다른 운행 보존.
운영 Worker 배포 후 자산/키 처리/서비스워커/구글 로그인/도로 보정/GPS 기존 기능 재조회 11개 통과.
실제 사용자의 휴대폰에서 GPS 경로가 서버에 완전히 저장됐는지는 원격 검증할 수 없음.

## 앞으로 Android 내장 native-bridge.js도 함께 고쳐야 함

다음 버전에서 `const historyKey = 'rs:trips:' + userId;`로 원래 로컬 키를 바로 읽고 쓰도록 고치고, 종료 시 서버 전송 전에 완전한 SQLite 경로를 합치는 원자적 절차를 도입할 것.
기존 앱의 서명키가 달라 APK 재설치를 요구하면 SQLite 기록이 삭제될 수 있으므로 이번 복구는 서버 업데이트로 먼저 해결.
