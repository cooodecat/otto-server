# Otto Server

NestJS 기반 백엔드 서버 with Supabase (Auth + Database)

## 🚀 빠른 시작

### 필수 요구사항

- Node.js 22+
- pnpm 9+

### 1. Supabase 프로젝트 생성

[Supabase Dashboard](https://app.supabase.com)에서 2개 프로젝트 생성:
- 개발용: `otto-server-dev`
- 프로덕션용: `otto-server-prod`

각 프로젝트에서:
1. **GitHub OAuth 설정**
   - Authentication → Providers → GitHub 활성화
   - GitHub OAuth App 생성 후 Client ID/Secret 입력
   - Callback URL: `https://[project-id].supabase.co/auth/v1/callback`

2. **데이터베이스 스키마 생성**
   - SQL Editor에서 `supabase/migrations/001_create_profiles.sql` 실행

### 2. 로컬 개발

```bash
# 저장소 클론
git clone https://github.com/your-org/otto-server.git
cd otto-server

# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env.dev
# .env.dev 편집 → Supabase Dev 프로젝트 정보 입력

# 개발 서버 실행
pnpm run dev

# http://localhost:4000 접속
```

## 📝 환경 변수

### 필수 설정

```env
# Supabase (Dashboard > Settings > API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret

# GitHub OAuth
OTTO_GITHUB_CLIENT_ID=your-client-id
OTTO_GITHUB_OAUTH_SECRET=your-secret
```

## 🧪 테스트

```bash
# 유닛 테스트
pnpm test

# E2E 테스트
pnpm test:e2e

# 테스트 커버리지
pnpm test:cov
```

## 🚢 프로덕션 배포 (EC2)

### EC2 설정

```bash
# Node.js 설치
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs

# PM2 설치
npm install -g pm2 pnpm

# 프로젝트 배포
git clone https://github.com/your-org/otto-server.git
cd otto-server
pnpm install --frozen-lockfile

# 프로덕션 환경 변수
cp .env.example .env
# .env 편집 → Supabase Prod 프로젝트 정보 입력

# 빌드 및 실행
pnpm run build
pm2 start dist/main.js --name otto-server

# 자동 시작 설정
pm2 startup
pm2 save
```

## 🛠 주요 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발 서버 실행 (hot-reload) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start:prod` | 프로덕션 서버 실행 |
| `pnpm test` | 테스트 실행 |
| `pnpm lint` | 코드 린트 및 자동 수정 |

## 📚 API 문서

서버 실행 후 다음 엔드포인트 확인:

- `GET /` - 헬스 체크
- `POST /api/v1/auth/signin` - GitHub 로그인
- `POST /api/v1/auth/signout` - 로그아웃
- `GET /api/v1/auth/profile` - 프로필 조회 (인증 필요)

## 🏗 프로젝트 구조

```
src/
├── app.module.ts           # 메인 모듈
├── main.ts                 # 엔트리 포인트
├── auth/                   # 인증 모듈
│   ├── auth.controller.ts
│   └── auth.module.ts
├── supabase/              # Supabase 통합
│   ├── supabase.service.ts
│   ├── guards/            # 인증 가드
│   └── strategies/        # Passport 전략
└── types/                 # TypeScript 타입
    └── database.types.ts  # Supabase 스키마 타입
```

## 🔧 문제 해결

### 포트 충돌
```bash
# 4000번 포트 사용 중인 프로세스 확인
lsof -i :4000

# PORT 환경변수로 포트 변경
PORT=3001 pnpm dev
```

### Supabase 연결 실패
- Supabase 프로젝트가 활성화되어 있는지 확인
- 환경 변수가 올바른지 확인
- 네트워크 연결 상태 확인

## 📄 라이센스

Private

## 🤝 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request