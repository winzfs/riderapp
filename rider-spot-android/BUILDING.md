# 라이더스팟 GPS 권한 수정 버전 1.0.1

v1.0.1: Android 앱 위치 권한을 첫 실행 시 요청하고, WebView Chrome 위치 API 대신 Android LocationManager GPS를 사용하는 브리지를 추가했습니다. WebView 상단 상태바 겹침 문제 수정. 내비게이션/타임라인의 위치 좌표는 동일한 네이티브 위치 소스에서 제공됩니다.

- Cloudflare 운영 웹앱은 변경하지 않았습니다.
- 백그라운드 **운행 기록**은 사용자 운행 시작 시 Android foreground service로 수행하며, 백그라운드 **타 라이더 실시간 위치 공유**는 지원하지 않습니다.
- APK debug 서명은 빌드마다 달라질 수 있으므로 기존 앱을 삭제 후 설치해야 할 수 있습니다. 삭제 전 기기에만 남은 운행 기록이 있다면 먼저 서버로 동기화하세요.
- GitHub Actions > Rider Spot Native APK > Artifacts > RiderSpot-Android-1.0.1-GPS-fix-debug.

빌드 원본: rider-spot-android/source.tar.xz
