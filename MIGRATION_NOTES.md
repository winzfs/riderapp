# Rider Spot 독립 저장소 이전 기록

- 원본 GitHub 저장소: `winzfs/riderapp`
- 원본 브랜치: `feature/rider-spot-native-apk`
- 이전 준비에 사용한 원본 커밋: `1b1abcea7e086bed1335e3dd77762e2a25344eaa`
- 새 저장소 권장 이름: `winzfs/rider-spot` (비공개 권장)
- 이 브랜치는 **배포 대상이 아닌 코드 이전 후보**입니다.

## 이전 범위

Rider Spot 전용 디렉터리(`rider-spot-web`, `rider-spot-android`,
`supabase`, `web-patches`, `docs`)와 자동 검증/디버그 APK
워크플로 두 개를 포함했습니다. 기존 목적지 중계 Android 앱
(`app/`, 루트 Gradle 프로젝트) 및 과거에 운영 배포를 수행하던
여러 GitHub Actions 워크플로는 새 저장소의 기본 트리에서 제외했습니다.

**주의:** GitHub Importer로 원본 저장소를 복사하면 다른 브랜치와
옛 커밋 이력도 함께 넘어올 수 있습니다. 이는 새 기본 브랜치의
현재 파일 구조와는 별개입니다. 역사까지 완전히 정리해야 한다면
별도 필터링/신규 초기화 작업을 실행해야 합니다.

## 사용자 작업(신규 저장소 생성)

1. https://github.com/new/import 에서 원본 URL
   `https://github.com/winzfs/riderapp.git`를 지정
2. owner: `winzfs`, name: `rider-spot`, visibility: **Private**
3. 가져오기 완료 후 이 새 저장소에서 `migration/rider-spot-standalone`를 확인
4. `main`을 이 브랜치의 코드 트리로 교체하고, 브랜치 보호·CI 설정
   및 실제 Android/Web 배포를 단계적으로 전환
5. 새 저장소에 GitHub 연결 앱의 접근 권한을 부여

## 절대 자동으로 진행하지 말아야 할 일

- 기존 Cloudflare `rider-spot` Worker 삭제/교체
- Supabase 프로젝트 `rider-spot` 변경·초기화
- Android 애플리케이션 ID·서명키 변경, 기존 앱 삭제
- 검증되지 않은 새 APK를 운영 배포
- 새 저장소의 과거 배포용 워크플로를 무분별하게 재활성화

## 이전 후 검증

1. GitHub 저장소에서 라이더스팟 소스·이전 준비 커밋 확인
2. `npm ci && npm test && npm run build` 통과 확인
3. Android 원본 아카이브를 이용한 디버그 APK 빌드 확인
4. 서버/실제 배포된 asset hash가 저장소 산출물과 일치하는지 확인
5. 실제 기기에서 로그인, GPS 시작/종료, 자정 이동, 저장·복원, 수익 기록,
   접근성 권한, 오프라인 복구, 앱 백그라운드 복귀 테스트
6. Cloudflare 배포/Worker 바인딩 및 Supabase 연결은 **검증 뒤** 전환

운영 서버·DB는 현재 기존 배포 설정과 별도로 계속 동작합니다.
