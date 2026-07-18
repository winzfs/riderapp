# RiderApp · 길찾기 Intent 캡처

배달앱에서 **길찾기 버튼을 누르는 순간** 카카오맵·티맵·네이버지도로 전달되는 Android Intent를 받아서 아래 값을 확인하는 네이티브 Android 테스트 앱입니다.

- 원본 URI
- URI scheme / host / path
- 목적지 위도·경도
- 목적지명
- Intent extras / flags / categories
- 최근 수신 기록 50개
- 저장 후 원래 네비 앱으로 재전달

현재 버전의 목적은 앱을 완성하는 것이 아니라, 배민커넥트·쿠팡이츠·요기요 등이 실제로 어떤 방식으로 네비를 호출하는지 확인하는 것입니다.

## 핵심 작동 구조

```text
배달앱에서 길찾기 누름
        ↓
이 앱이 암시적 Intent 수신
        ↓
URI·좌표·목적지명 로컬 저장
        ↓
카카오맵 / 티맵 / 네이버지도 실행
```

Android가 우리 앱에 Intent를 전달하려면 배달앱이 `geo:`, `kakaomap:`, `tmap:`, `nmap:` 같은 **암시적 Intent**를 사용해야 합니다. 배달앱이 네비 앱의 package/component를 직접 지정하는 **명시적 Intent**를 사용하면 일반 앱은 중간에서 가로챌 수 없습니다.

## 지원 중인 입력 형식

- Android 공용 `geo:` URI
- Kakao Map `kakaomap://...`
- TMAP `tmap://...`
- NAVER Map `nmap://...`
- Kakao 모바일 웹 `m.map.kakao.com/scheme/...`

파서는 다음과 같은 대표 목적지 값을 인식합니다.

```text
geo:35.1595454,126.8526012?q=35.1595454,126.8526012(광주광역시청)
kakaomap://route?sp=35.1,126.8&ep=35.1595454,126.8526012&by=car
tmap://route?rGoName=광주광역시청&rGoX=126.8526012&rGoY=35.1595454
nmap://navigation?dlat=35.1595454&dlng=126.8526012&dname=광주광역시청&appname=com.example
```

## APK 만들기

이 저장소는 컴퓨터가 없어도 GitHub Actions에서 APK를 만들도록 구성했습니다.

1. 저장소의 **Actions** 탭으로 이동합니다.
2. `Build APK` 워크플로를 엽니다.
3. `Run workflow`를 누릅니다.
4. 완료된 실행의 `Artifacts`에서 `riderapp-debug-apk`를 받습니다.
5. ZIP 안의 `riderapp-debug.apk`를 Android 폰에 설치합니다.

`main` 브랜치에 파일을 올릴 때도 자동으로 새 APK가 빌드됩니다.

## 실제 배달앱 테스트 순서

1. 앱을 설치하고 한 번 실행합니다.
2. 처음에는 **수신 후 자동으로 네비 열기**를 끈 상태로 둡니다.
3. 카카오맵·티맵·네이버지도의 기존 기본 연결 설정이 있다면 Android 설정에서 기본값을 지웁니다.
4. 배달앱에서 가게 또는 배달지의 **길찾기**를 누릅니다.
5. 앱 선택창에 `라이더 길찾기 캡처`가 나오면 선택합니다.
6. 앱 화면에서 원본 URI, 좌표, 목적지명, Extras를 확인합니다.
7. 확인이 끝나면 자동 네비 열기를 켜서 중계 동작을 시험합니다.

### 결과 판정

| 결과 | 의미 |
|---|---|
| 이 앱이 선택 후보로 나타나고 URI가 기록됨 | 표준 Intent 중계 방식 사용 가능 |
| 네비가 바로 열리고 이 앱은 전혀 나타나지 않음 | 네비 package/component 직접 지정 가능성이 큼 |
| 앱은 열리지만 좌표가 비어 있음 | 원본 URI 또는 extras를 보고 파서를 추가해야 함 |

## 개인정보와 권한

- 인터넷 권한 없음
- 위치 권한 없음
- 접근성 권한 없음
- 수신 기록은 `SharedPreferences`에 기기 내부 저장
- 주소 역지오코딩과 서버 전송은 아직 없음
- 고객의 동·호수나 공동현관 비밀번호를 저장하도록 설계하지 않음

## 다음 단계

실제 배달앱에서 전달되는 원본 URI를 확보하면 다음 기능을 붙일 수 있습니다.

1. 좌표를 도로명주소·건물명으로 변환
2. 첫 번째 호출은 가게, 두 번째 호출은 배달지로 분류
3. 건물별 진입구·주차·엘리베이터 개인 메모
4. 네비 연결 전 0.5초 안에 자동 기록
5. 명시적 Intent라 중계가 불가능할 경우 접근성 기반 보조 방식 별도 검토

## 참고 문서

- Android Intents and Intent Filters: https://developer.android.com/guide/components/intents-filters
- Android common map intents: https://developer.android.com/guide/components/intents-common
- Kakao Map URL Scheme: https://apis.map.kakao.com/android_v2/docs/api-guide/urlscheme/
- NAVER Map URL Scheme: https://guide.ncloud-docs.com/docs/maps-url-scheme
