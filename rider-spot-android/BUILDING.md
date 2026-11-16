# 라이더스팟 v1.0.2: 화면 꺼짐 GPS 기록 보강

기존 Android 앱 기능은 유지하며 화면 잠금 후 생기는 기록 공백을 줄이기 위한 수정입니다.

- 위치 요청: 3초 간격·거리 제한 0m, GPS+Fused+Network(Android 지원 범위)
- 정지 중에도 최대 약 25초마다 저장 가능한 좌표 유지(위치 공급자가 갱신을 전달하는 조건)
- 명시적으로 시작한 GPS 전경 서비스의 시스템 재시작 복구(START_STICKY)
- 운행 기록 중에만 부분 CPU wake lock 사용; 일시정지/종료 때 즉시 해제
- 종료 시 SQLite 전체 경로를 합쳐 Supabase 재업로드, 실패 시 오프라인 큐에 재전송
- 원본 SQLite 경로는 기기 내 유지, 기존 Cloudflare/Supabase 데이터·운영 코드 변경 없음

**주의:** 안드로이드 OS 강제 중지, 절전 정책, 권한 해제, GPS 신호 차단으로 실제 샘플이 없는 구간은 복원할 수 없습니다. 실기기 장시간 검증 전 베타 APK입니다. 기존 APK 제거 시 기기 미동기화 기록 손실 가능성이 있으므로 기존 데이터 서버 동기화 후 업데이트 설치하세요.

APK: GitHub Actions > Rider Spot Native APK > Artifacts > RiderSpot-Android-1.0.2-ScreenOff-fix-debug.
