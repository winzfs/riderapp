# 라이더스팟 타임라인 도로 경로 표시 v38

기존 GPS 원본 좌표는 도로를 따르지 않으므로 경로 선이 건물을 가로지를 수 있습니다.

Cloudflare Worker 배포 사항:
- GPS 표본 간 30초 이상 공백 또는 비현실적 순간 속도(38m/s 이상)에서는 선을 끊어 표시
- `도로에 맞춰 보기` 버튼에 동의한 경우에만 OSRM 공개 맵매칭 서비스로 GPS 좌표 전달
- POST /api/route-match: 최대 16KB, 요청당 GPS 4~70개, 요청 데이터 저장하지 않음
- OSRM 신뢰도가 0.5 미만일 경우 맵매칭 선을 표시하지 않음
- 원본 SQLite·Supabase 운행 기록은 유지. 지도 표시만 토글, 최대 5배치까지 지원하는 시범 기능
- 로그인·시설·운행 데이터베이스 스키마 변경 없음

OSRM 공개 데모 서버는 가용성 보장이 없고 사용량 제한이 있으므로 서비스 운영 확대 전 전용 서버 필요.
APK는 Worker 웹 UI를 로드하므로 재설치 없이 앱 재시작으로 반영 가능.

참고:
- https://project-osrm.org/docs/v26.6.1/http
- https://github-wiki-see.page/m/Project-OSRM/osrm-backend/wiki/Demo-server
