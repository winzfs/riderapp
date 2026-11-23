# Rider Spot — 라이더스팟

배달 라이더를 위한 지도, 운행 타임라인, GPS 기록, 수익 관리, 차량 정비, 동네 정보 서비스입니다.

## 저장소 구조

- `rider-spot-web/`: 웹앱 소스, 지도, 수익, 타임라인, 테스트
- `rider-spot-android/`: Android WebView 앱 소스 아카이브와 브리지/빌드 도구
- `supabase/`: 서버 함수와 데이터베이스 마이그레이션
- `web-patches/`: 과거 복구 패치 및 검증 자료
- `docs/`: 장소 데이터 문서

## 로컬 빌드/테스트

```sh
cd rider-spot-web
npm ci
npm test
npm run build
```

Android 소스 및 테스트 절차는 `rider-spot-android/BUILDING.md`와
`.github/workflows/rider-spot-native-apk.yml`을 참고하세요.

## 중요한 이전/배포 안내

이 스냅샷은 이전 준비용입니다. 새 저장소에 복사한 것만으로
Cloudflare Worker, Supabase 프로젝트, Android 패키지·서명, 실제 라이더스팟 APK,
GitHub Actions 비밀값 또는 운영 배포가 자동 이전되지는 않습니다.

운영 배포는 **별도 승인 및 동등성 검증 후에만** 연결하세요.
특히 새 앱이 기존 기기에 저장된 SQLite GPS·운행 내역을 그대로
읽을 수 있어야 하며, 서명키/패키지명 변경과 운영 DB 초기화를 금지합니다.
현재 운영 소스와 이 스냅샷의 차이 확인 없이 APK를 배포하지 마세요.

자세한 인수인계는 `MIGRATION_NOTES.md` 참고.
