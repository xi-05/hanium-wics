# 초기 진입 인증 검증

2026-08-20 브라우저 검증 결과, 미인증 상태에서 WICS 도메인(`/`) 접속 시 대시보드가 노출되지 않고 Manus OAuth 로그인 화면으로 이동했다.

확인된 화면 제목: `Login`
확인된 문구: `Sign in to WICS - Web-based Integrated Control System`
확인된 URL 패턴: `/app-auth?...&type=signIn`

구현 검증 항목:
- App의 AuthGate가 인증 확인 전 대시보드를 렌더링하지 않음.
- 인증 정보가 없으면 로그인 안내 화면을 표시하고 OAuth 로그인 URL로 이동함.
- 기존 WICSLayout의 미인증 가드와 로그아웃 후 history replace 흐름을 유지함.

추가 브라우저 검증: 미인증 상태에서 `/robots`로 직접 접근해도 대시보드나 로봇 관리 화면이 노출되지 않고 동일한 Manus OAuth 로그인 화면(`/app-auth?...&type=signIn`)으로 이동했다. App 전역 AuthGate가 라우트 진입 전에 적용되는 것을 확인했다.

추가 브라우저 검증: 미인증 상태에서 `/monitoring`으로 직접 접근해도 Manus OAuth 로그인 화면으로 이동했다. 따라서 App 전역 AuthGate가 직접 URL 진입에도 적용된다.

추가 브라우저 검증: 미인증 상태에서 `/maps`로 직접 접근해도 동일한 Manus OAuth 로그인 화면으로 이동했다.

추가 브라우저 검증: 미인증 상태에서 `/detections`로 직접 접근해도 동일한 Manus OAuth 로그인 화면으로 이동했다.

추가 브라우저 검증: 미인증 상태에서 `/reports`로 직접 접근해도 동일한 Manus OAuth 로그인 화면으로 이동했다.

추가 브라우저 검증: 미인증 상태에서 `/users`로 직접 접근해도 동일한 Manus OAuth 로그인 화면으로 이동했다.

추가 브라우저 검증: 미인증 상태에서 `/control`로 직접 접근해도 동일한 Manus OAuth 로그인 화면으로 이동했다. 주요 보호 라우트(`/`, `/robots`, `/monitoring`, `/maps`, `/detections`, `/reports`, `/users`, `/control`)의 미인증 접근 차단을 확인했다.
