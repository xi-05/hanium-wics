# WICS (Web-based Integrated Control System) 로컬 실행 및 빌드 가이드

이 문서는 제공된 프로젝트 소스 아카이브를 사용자의 로컬 개발 환경에서 설치, 설정, 실행, 테스트 및 프로덕션 빌드하는 방법을 안내합니다.

---

## 1. 사전 요구사항

로컬 환경에서 프로젝트를 실행하기 위해 다음 도구들이 설치되어 있어야 합니다.

- **Node.js**: v18.0.0 이상 권장 (프로젝트 설정은 Node.js 22 기준)
- **pnpm**: v9.0.0 이상 (권장 패키지 매니저)
- **MySQL 또는 TiDB**: 데이터베이스 인스턴스 (로컬 MySQL 8.0+ 또는 원격 연결 가능한 MySQL 호환 DB)

---

## 2. 프로젝트 압축 해제 및 패키지 설치

제공된 `wics-control-system-source.zip` 압축을 해제한 뒤, 프로젝트 폴더로 이동하여 의존성을 설치합니다.

```bash
unzip wics-control-system-source.zip
cd wics-control-system
pnpm install
```

---

## 3. 환경 변수(`.env`) 설정

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 필수 환경 변수를 설정해야 합니다.

아카이브에는 보안을 위해 `.env`가 포함되어 있지 않습니다. 아래 값을 그대로 복사하는 것이 아니라, 본인의 실제 값으로 바꿔야 합니다.

```env
# 데이터베이스 연결 URL (MySQL 호환)
# 비밀번호에 @, :, /, # 등이 있으면 URL 인코딩해야 합니다.
DATABASE_URL=mysql://username:password@127.0.0.1:3306/wics_db

# 세션 및 인증 시크릿
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars

# Manus OAuth 설정 (로컬 테스트 시 플레이스홀더 또는 실제 앱 설정 사용)
VITE_APP_ID=your_real_manus_oauth_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=your_owner_open_id
OWNER_NAME=Administrator
```

`DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID` 중 하나라도 비어 있거나 예시값이면 인증이 정상 동작하지 않습니다. `.env`는 반드시 `package.json`과 같은 프로젝트 루트에 두고, 값을 변경한 뒤에는 개발 서버를 재시작해야 합니다.

MySQL을 직접 설치한 경우 예시는 다음과 같습니다.

```sql
CREATE DATABASE wics_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wics'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT ALL PRIVILEGES ON wics_db.* TO 'wics'@'localhost';
FLUSH PRIVILEGES;
```

---

## 4. 데이터베이스 스키마 마이그레이션

데이터베이스에 필요한 테이블(`users`, `robots`, `missions`, `detections`, `maps` 등)을 생성하기 위해 마이그레이션을 실행합니다.

```bash
# 현재 schema.ts 기준으로 마이그레이션을 생성하고 DB에 반영
pnpm db:push
```

DB 연결을 먼저 확인하려면 다음 명령을 실행합니다.

```bash
mysql -h 127.0.0.1 -u wics -p wics_db -e "SELECT 1;"
```

`Can't connect`, `Access denied`, `Unknown database`가 나오면 회원가입도 실패합니다. 이 경우 `DATABASE_URL`의 호스트·포트·사용자·비밀번호·DB 이름을 실제 MySQL 설정과 맞춰야 합니다.

또는 Drizzle 설정에 따라 스키마를 푸시합니다.

---

## 5. 개발 서버 실행

로컬 개발 서버를 실행하여 프론트엔드(Vite)와 백엔드(Express + tRPC)를 동시에 구동합니다.

```bash
pnpm dev
```

- 서버가 정상 구동되면 브라우저에서 `http://localhost:3000`으로 접속할 수 있습니다.
- 최초 접속 시 이메일 로그인 화면이 표시됩니다.
- 이메일 회원가입·로그인은 위의 `DATABASE_URL`과 마이그레이션이 필요합니다.
- Google/Microsoft/Apple 버튼은 Manus OAuth 앱 설정이 필요합니다. Manus OAuth 콘솔에 로컬 콜백 주소 `http://localhost:3000/api/oauth/callback`를 등록하고, 발급된 App ID를 `VITE_APP_ID`에 입력해야 합니다.
- Vite 환경 변수(`VITE_*`)를 변경한 뒤에는 반드시 `pnpm dev`를 다시 실행해야 합니다.

---

## 6. 테스트 실행

프로젝트에 포함된 단위 및 통합 테스트(Vitest)를 실행하여 백엔드 라우터, 인증, 권한 제어 로직이 정상 작동하는지 검증합니다.

```bash
# 타입 체크 및 전체 테스트 실행
pnpm check
pnpm test
```

---

## 7. 프로덕션 빌드 및 실행

배포를 위해 프론트엔드를 빌드하고 백엔드 서버 번들을 생성합니다.

```bash
# 프로덕션 빌드 (Vite 빌드 + esbuild 서버 번들링)
pnpm build

# 프로덕션 모드로 서버 실행
pnpm start
```
