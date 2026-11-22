# RiderSpot 수익 내역 일별 건별 표시 · v28

- 서버 DB: 기존 `public.rider_auto_deliveries` 컬럼 `captured_at`(수익 인식 시간), `created_at`(서버 저장 시간), `work_date`(03시 업무일)
- 수익 → 내역: **일별 배달 수익** 카드 신설, 날짜 선택 및 전일/다음날 이동, 기본값 오늘
- 날짜별 `rider_auto_deliveries`를 `user_id` + `work_date`로 필터링, `captured_at` 최신순, 페이지당 200건씩 안전하게 전체 조회(최대 20,000건, 초과 시 표시)
- 수익 인식 시각은 한국 시간 시·분·초까지 표시; 30초 넘게 서버 동기화 지연 시 `서버 저장 HH:mm:ss` 보조 표시
- 각 항목의 플랫폼, 기본/추가/리워드 수수료, 자동 반영/중복 확인/기존 수익 포함/제외 상태 표시
- 카드 상단 날짜별 **자동 반영 수익 합계**는 `status='applied'` 항목만 계산. 기존 `rider_earnings` 기준 날짜별 **전체 수익** 집계와 타임라인 누적 금액은 그대로 유지. 합계 이중 집계 없음
- 12건까지만 우선 화면에 그려 앱 부담을 줄이고, `더 보기`로 20건씩 계속 확인 가능
- 서버 조회만 수행하는 React 자식 컴포넌트. GPS, 정차, 지도, 수익 등록/수정 로직, 네이티브 APK에 변경 없음
- 현재 앱에서 가져오는 자동 수집 원장에만 적용. 예전 독립 v0.7 진단 앱의 미동기화 기록은 가져오지 않음
- 웹 릴리스 해시: `6a3892af3623`; 이전 운영 릴리스 `dd55145c6135` 포함한 모든 기존 불변 자산 유지
- Cloudflare: `rider-spot-map-v25-assets`의 KV 프런트만 새 릴리스로 변경; `rider-spot` 게이트웨이, 인증/수익 DB, 네이티브 APK 불변
- 롤백: 운영 Assets Worker 이전 version `54facede-2cb7-403a-9e66-5d430762f1d8`
- 새 운영 Assets Worker version `c0c482f6-cff7-492d-a26d-3a58debc49ba`
- 테스트: `rider-spot-web/tests/auto-income-time-list.test.cjs`, 운영 JS 문법/레거시 자산/API, 기존 npm test 및 모바일 브라우저 안정성
