# 라이더스팟 Android v1.0.6 — GPS 연결 및 운행 수집 안정성
- Play Services FusedLocationProvider 21.4.0 고정밀 위치 요청 + GNSS GPS + 네트워크 이중 폴백
- 별도 HandlerThread에서 GPS 콜백 및 SQLite 영구 저장, UI/WebView 정지와 분리
- 10초 주기 상태검사, 35초 이상 승인 좌표가 없을 때 30초 쿨다운을 두고 재연결
- 화면 잠금 후 지연/순서가 뒤바뀐 위성 좌표를 버리지 않도록 저장소 개선
- SQLite DB 버전 2: 시간 인덱스 추가, 기존 기록 삭제/마이그레이션 없음
- 운행 중 웹 화면 좌표는 원본 SQLite에서만 받아 화면에 표시
- Android가 위치 전경 서비스를 종료했을 때 앱 재진입 후 복구
- 알림창에 GPS 지연/정상 기록 상태 표시, GPS 상태 로컬 진단 API 제공
- 구글 로그인, 알림 운행 종료, 1분 이상 정차 감지, 서버 저장 방식 유지
- 원본 경로는 종료할 때만 Supabase에 저장, 다른 라이더에게 위치 공유는 별도 동의

설치 시 기존 서명키 차이로 덮어쓰기가 거절되면 삭제 전에 저장하지 못한 운행 기록이 없는지 확인.
화면 잠금/전원 관리 및 네비 동시사용 실기기 수시간 검증은 아직 수행하지 못했습니다.
GitHub Actions > Rider Spot Native APK > Artifacts > RiderSpot-Android-1.0.6-GPS-Stability-debug
소스 tar.xz: rider-spot-android/source.tar.xz