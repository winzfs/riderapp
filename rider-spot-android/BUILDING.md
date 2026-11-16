라이더스팟 Android v1.0.4 (Google OAuth 복귀 수정)

원인: 외부 Chrome은 WebView와 다른 쿠키/세션 저장소를 사용하여 Google 로그인 후 Chrome에만 로그인되었습니다.

해결:
- 네이티브 브리지 signInWithOAuth(skipBrowserRedirect=true), 기존 Supabase 승인 URL 루트로 redirectTo 유지
- Chrome에서 OAuth 실행, Cloudflare Worker의 단기 HttpOnly 쿠키가 있는 브라우저만 로그인 완료 브릿지 실행
- 라이더스팟 Android 딥링크 (riderspot-oauth://signin/callback)와 nonce 검증 후 app WebView의 기존 Supabase auth.setSession() 호출
- GPS, 운행 종료 서버 전송, 알림 기능은 그대로 유지

운영 Cloudflare Worker에 server/native-oauth-worker.js 로직 배포 필요.
백그라운드 GPS 경로는 운행 중 로컬 저장, 종료 시에만 서버에 업로드됩니다.
Debug 빌드 서명이 다를 수 있으니 삭제 전 미동기화 기록 확인.
