# 라이더스팟 v1.0.3 · 로컬 기록 및 알림 종료

- 운행 시작 후 GPS는 Android 전경 서비스에서 SQLite에만 저장. 앱의 웹 타임라인도 로컬 저장.
- 운행 종료(앱 또는 Android 알림)할 때 전체 네이티브 GPS 기록을 병합해 Supabase 서버로 전송. 실패 시 기기 내부 보존 후 재전송.
- 15초 GPS 상태 감시, 45초 이상 콜백 중단 시 공급자 재등록, 부정확한 위치 필터 및 로컬 기록 심플 개선.
- 알림 영역에 '라이더스팟 · GPS 운행 기록 중' 표시 및 '운행 종료' 버튼 제공. 알림 버튼 누르면 라이더스팟이 열리며 기록 종료/최종 동기화.
- 서버에 위치를 실시간 공유하는 별도 기능은 사용자 동의 시에만 동작, 운행 기록과 독립.
- Android 13+에서 알림 표시 허용 필요. 알림 권한 거부 시 설정 안내.
- Android 강제 종료/위치 서비스 비활성화/권한 철회/GPS 음영 지역은 누락될 수 있고, 없는 경로는 만들지 않음.
- 테스트 소스: rider-spot-android/source.tar.xz. 분리 브랜치에만 저장, 기존 riderapp main 및 rider-spot Cloudflare 웹앱은 변경하지 않음.
- Debug APK는 빌드마다 서명이 달라 기존 버전 덮어쓰기가 거부될 수 있음. 삭제 전 로컬 기록이 서버에 동기화됐는지 확인.

빌드: Actions → Rider Spot Native APK → Artifacts → RiderSpot-Android-1.0.3-LocalGPS-Notification-debug.
