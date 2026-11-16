# 라이더스팟 지도 지명 밀도 v47

운영 Cloudflare Worker 배포 일시: 2026-11-16T16:18:41.705257Z

## 변경 내용

- 기존 OpenFreeMap Positron 지도 스타일, GPS 기록, 타임라인, 경로선, 로그인은 그대로 유지
- `rs46-district-labels`를 10.1배율부터 표시하고 충돌로 숨겨지는 현상을 줄이기 위해 레이어 우선순위 조정
- `rs46-neighbourhood-labels`는 11배율부터 표시하고 라벨 여백을 줄여 가능한 더 많은 장소명을 표시
- 광주 광산구 파일럿 지역에서 저배율만 쓰는 지역명 보조 오버레이 추가: 운남동, 월곡동, 수완지구, 신창동
- 이 이름들의 좌표는 공공문화·지역 소개 자료의 **대표 지점**을 참고한 것으로 행정동 중심점이나 구역 경계를 뜻하지 않음
- 오버레이는 지도 배율 10.7 이상 13.8 미만에서만 사용. 확대하면 지도 공급자의 원래 표기로 전환
- MapLibre style.load 재로드 시에도 기존 레이어·소스 중복 추가 방지
- Service Worker 및 메인 JS 캐시 리비전 v47로 갱신

## 참고 위치 자료

- 운남동: https://dh.aks.ac.kr/~gwangju/wiki/index.php/운남동
- 월곡동 표시 기준점(월곡시장): https://dh.aks.ac.kr/~gwangju/wiki/index.php/월곡시장
- 수완지구: https://dh.aks.ac.kr/~gwangju/wiki/index.php/수완택지개발지구
- 신창동: https://dh.aks.ac.kr/~gwangju/wiki/index.php/신창동

자동 코드 검사 및 운영 재조회 통과. Android 실기기 화면에서 지도 데이터·라벨 실제 노출 여부는 아직 검증되지 않음.
