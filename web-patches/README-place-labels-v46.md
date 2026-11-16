# 라이더스팟 지도 지명 표시 개선 v46

2026-11-17 운영 Cloudflare Worker에 배포 완료.

- 기존 OpenFreeMap Positron 지도 스타일은 유지하고 MapLibre GL의 OpenMapTiles `place` 레이어를 이용해 저배율 지명 추가
- 10.7배율부터 동/구역 단위 (`suburb`, `borough`, `town`), 11.6부터 동네·마을 (`quarter`, `neighbourhood`, `village`, `hamlet`)
- 12.6배율부터 주요 도로명 (`transportation_name`, `trunk`~`tertiary`)을 얇고 흐린 글씨로 보강
- 지명 언어는 `name:ko` → `name:nonlatin` → `name` → `name:latin` 순서로 폴백
- MapLibre 스타일이 재로드돼도 중복 레이어 없이 복원
- 기존 SQLite GPS, 도로 보정, 구글 OAuth, 타임라인 시간 토글, CSS 테마, Supabase 변경 없음
- HTML main JS 버전 쿼리 및 Service Worker 캐시를 v46으로 갱신

`rider-spot-map-labels-v46.js`는 배포한 MapLibre 커스텀 라벨 함수의 정확한 사본입니다. 운영 서버에는 기존 React 번들 내부 `restorePlaceNames()` 바로 앞에 이 함수를 삽입하고, 기존 POI 레이어 등록 직후 호출하도록 적용했습니다.

실제 지도에서 모든 동네 이름이 등장하는지 여부는 OpenStreetMap 기반 지도 데이터의 지명 포함 여부와 충돌 회피 정책에 따라 다를 수 있어, 기기 화면에서 확인이 필요합니다.

참고: https://openmaptiles.org/docs/schema/ , https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/
