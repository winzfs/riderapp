# RiderApp · 배달 목적지 중계

배달앱에서 **길찾기 버튼을 누르는 순간** 목적지 Intent를 받아 저장하고, 작은 오버레이로 보여준 뒤 원하는 지도 앱으로 연결하는 네이티브 Android 앱입니다.

## 주요 기능

- 쿠팡이츠 배달파트너 등에서 전달된 목적지명·위도·경도 수집
- 현재 목적지를 다른 앱 위에 작은 플로팅 오버레이로 표시
- 오버레이 드래그 이동 및 즉시 닫기
- 카카오내비·카카오맵·티맵·네이버지도·구글지도 연결
- 매번 사용할 지도 앱을 다시 고르는 선택창
- 최근 수신 기록 50개 기기 내부 저장
- 인터넷·위치·접근성 권한 없이 동작

## 작동 구조

```text
배달앱에서 길찾기 누름
        ↓
RiderApp 선택
        ↓
목적지 URI·좌표·이름 저장
        ↓
작은 목적지 오버레이 표시
        ↓
원하는 지도 앱 선택 및 실행
```

배달앱이 `geo:`, `kakaonavi-sdk:`, `kakaomap:`, `tmap:`, `nmap:` 같은 **암시적 Intent**를 사용해야 RiderApp이 연결 프로그램 후보로 나타납니다.

## 지원 지도 앱

| 앱 | 연결 방식 |
|---|---|
| 카카오내비 | `kakaonavi-sdk://navigate` WGS84 목적지 변환 |
| 카카오맵 | `kakaomap://route` 및 `geo:` 대체 경로 |
| 티맵 | 현재·구형 패키지와 두 가지 `tmap:` 호출 형식 순차 지원 |
| 네이버지도 | `nmap://navigation` 및 자동차 경로 대체 형식 |
| 구글지도 | `google.navigation:` 및 `geo:` 대체 경로 |

기존 버전의 `원래 네비 자동 감지` 설정은 0.3.0부터 **매번 지도앱 선택**으로 자동 변경됩니다.

## 오버레이 사용

1. 최신 APK 설치 후 RiderApp을 엽니다.
2. **오버레이 권한 허용하기**를 누릅니다.
3. Android 설정에서 RiderApp의 `다른 앱 위에 표시`를 허용합니다.
4. RiderApp으로 돌아와 `다른 앱 위에 현재 목적지 표시`를 켭니다.
5. 배달앱에서 길찾기를 실행하고 RiderApp을 선택합니다.
6. 내비 화면 위에 목적지명과 좌표가 작은 카드로 표시됩니다.

오버레이는 상단 부분을 드래그해서 옮길 수 있고 `×` 버튼으로 닫을 수 있습니다. Android 12 이상에서 대상 앱이 오버레이 표시를 차단하면 그 앱 화면에서는 보이지 않을 수 있습니다.

## APK 만들기

1. 저장소의 **Actions** 탭으로 이동합니다.
2. `Build APK` 워크플로를 엽니다.
3. `Run workflow`를 누르거나 `main` 브랜치의 자동 빌드가 끝날 때까지 기다립니다.
4. 완료된 실행의 `Artifacts`에서 `riderapp-debug-apk`를 받습니다.
5. ZIP 안의 `riderapp-debug.apk`를 설치합니다.

## 실제 사용 권장 설정

- 지도 앱: **매번 지도앱 선택**
- 목적지를 받으면 바로 지도 앱 선택/실행: 켜기
- 다른 앱 위에 현재 목적지 표시: 켜기
- 배달앱에서 RiderApp을 기본 연결 앱으로 고정하지 말고 우선 `한 번만`으로 시험

## 개인정보와 권한

- 인터넷 권한 없음
- 위치 권한 없음
- 접근성 권한 없음
- `다른 앱 위에 표시` 권한은 목적지 오버레이에만 사용
- 목적지는 기기 내부 `SharedPreferences`에 저장
- 고객 동·호수나 공동현관 비밀번호를 별도로 수집하지 않음

## 참고 문서

- Android Intents and Intent Filters: https://developer.android.com/guide/components/intents-filters
- Android application overlays: https://developer.android.com/reference/android/view/WindowManager.LayoutParams#TYPE_APPLICATION_OVERLAY
- Foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types
- Kakao Navi Android: https://developers.kakao.com/docs/ko/kakaonavi/android
- Kakao Map URL Scheme: https://apis.map.kakao.com/android_v2/docs/api-guide/urlscheme/
- NAVER Map URL Scheme: https://guide.ncloud-docs.com/docs/maps-url-scheme
