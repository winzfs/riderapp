# RiderSpot · 나의 1년 캘린더 v1

2026-11-23 운영 Worker `rider-spot`에 읽기 전용 캘린더를 추가했다.

## 사용 진입점
- 수익 탭 오른쪽의 `▦ 나의 1년` 버튼
- 연간 12개월 활동 타일, 근무 기록/수익 구간 전환, 연도 전환
- 월간 및 일간 운행·수익·거리·시간 조회

## 연동
- GET Supabase `trips`: user_id / started_at / ended_at / distance_km. 완료 운행만.
- GET Supabase `rider_earnings`: user_id / work_date / gross_won / gross_entered / deliveries. 수익 탭과 같은 `gross_entered !== false` 기준.
- `rider_auto_deliveries`는 이중 합산 방지 위해 별도로 더하지 않음.
- 시작 날짜는 한국 표준시 기준. 날짜당 운행시간은 중복 세션이 없는 정상 데이터 기준.
- Supabase 인증 세션 + RLS 사용. 개인 활동 및 수익 정보 공개하지 않음.
- 새로운 테이블, DDL, GPS, 운행 수집, 수익 쓰기 없음.

## 배포
- 프런트 원본: `src/year-calendar-bridge.js`
- 배포한 전체 Worker 소스 복제본: `edge/rider-spot-gateway-my-year-v1.mjs`
- 갱신한 운영 Worker: `rider-spot`, 서비스 바인딩 기존 `ASSETS/DESIGN/LEGACY` 그대로.
- 웹 모듈 번들 및 복구 가드, OAuth 관련 분기는 유지.
- 운영 이전 소스/바인딩은 `edge/backups/rider-spot-prod-*-20261123.*`에 백업.
- 재사용한 `rider-spot-urban-preview` 워커는 이전 원본과 바인딩으로 복구.

## 확인
- Cloudflare Browser Rendering: 운영/미리보기에서 메뉴 표시와 연간·월간·일별 조회 테스트.
- 가상 데이터 fixture 검증: 2 근무일, 수익 169,500원, 거리 78.6km, 11월 22일 104,500원 및 5시간 30분 등.
- 비로그인 상태: 로그인 요청 표시.
- 운영 Worker 복구 가드와 기존 메인 앱 해시 유지 확인.
- 실제 기기에서 로그인한 계정으로 연간 데이터가 표시되는지는 후속 현장 확인 필요.

## 업데이트 주의
새 웹 디자인을 배포하거나 `rider-spot` Worker를 덮어쓸 때 `YEAR_PATH`, `YEAR_SCRIPT`, 루트 `</head>` 삽입, 연간 스크립트 GET 라우트를 유지하지 않으면 캘린더 버튼이 사라질 수 있음. 장기적으로 웹 빌드 산출물에 정식 통합 권장.
