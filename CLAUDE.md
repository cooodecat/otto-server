# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Otto Server is a NestJS backend API server with Supabase integration for authentication and database operations. The project follows clean architecture patterns with modular structure, TypeScript strict typing, and comprehensive testing.

## Common Development Commands

```bash
# Development
pnpm dev                     # Start development server with hot-reload (port 4000)
pnpm start:debug            # Start with debugging enabled

# Building & Production
pnpm build                  # Build for production
pnpm start:prod            # Run production build (requires prior build)
pnpm prod                  # Build and run production in one command

# Testing
pnpm test                   # Run unit tests
pnpm test:watch            # Run tests in watch mode
pnpm test:e2e              # Run end-to-end tests
pnpm test:cov              # Run tests with coverage report

# Code Quality
pnpm lint                   # Run ESLint and auto-fix issues
pnpm format                # Format code with Prettier
pnpm format:check          # Check formatting without changes

# Database
pnpm supabase:types        # Generate TypeScript types from Supabase schema
```

## Architecture & Code Structure

### Module Organization
- **app.module.ts**: Root module with global configuration (ConfigModule, ThrottlerModule)
- **auth/**: Authentication module with GitHub OAuth via Supabase
- **supabase/**: Core Supabase integration module
  - `supabase.service.ts`: Main service for Supabase operations
  - `guards/supabase-auth.guard.ts`: JWT authentication guard
  - `strategies/supabase-jwt.strategy.ts`: Passport JWT strategy
- **types/**: TypeScript type definitions
  - `database.types.ts`: Supabase schema types (auto-generated)
  - `auth.types.ts`: Authentication-related types

### Key Architectural Decisions
1. **Modular Architecture**: Each domain has its own module with controller, service, and types
2. **Supabase Integration**: Uses Supabase for both authentication (GitHub OAuth) and database
3. **JWT Authentication**: Passport.js with custom Supabase JWT strategy
4. **Rate Limiting**: Three-tier throttling (short: 3/sec, medium: 20/10sec, long: 100/min)
5. **Environment Configuration**: Multi-environment support with `.env.{NODE_ENV}` files

## Critical Implementation Guidelines

### TypeScript Standards (from .cursorrules)
- **Always** declare types for all variables, parameters, and return values
- **Never** use `any` type
- Use PascalCase for classes, camelCase for variables/functions, kebab-case for files
- Functions should be < 20 instructions with single purpose
- Classes should follow SOLID principles, < 200 instructions, < 10 public methods
- Prefer composition over inheritance
- Use RO-RO pattern (Receive Object, Return Object) for functions with multiple parameters

### NestJS Patterns
- One module per domain/route
- DTOs with class-validator for input validation
- Simple types for outputs
- Services contain business logic and persistence
- Guards for permission management
- Global exception filters for error handling

### File Naming Convention
```
src/
├── [module-name]/
│   ├── [module-name].module.ts
│   ├── [module-name].controller.ts
│   ├── [module-name].service.ts
│   ├── dto/
│   │   └── [action]-[entity].dto.ts
│   └── types/
│       └── [entity].types.ts
```

## Environment Setup

### Required Environment Variables
```env
# Core
PORT=4000
NODE_ENV=development|production

# Supabase (from Dashboard > Settings > API)
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=[anon-public-key]
SUPABASE_JWT_SECRET=[jwt-secret]
SUPABASE_PROJECT_ID=[project-id]

# GitHub OAuth
OTTO_GITHUB_CLIENT_ID=[github-client-id]
OTTO_GITHUB_OAUTH_SECRET=[github-oauth-secret]

# CORS
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

### Environment Files Priority
1. `.env.{NODE_ENV}` (e.g., `.env.dev`, `.env.production`)
2. `.env` (fallback)

## API Endpoints

- `GET /` - Health check
- `POST /api/v1/auth/signin` - GitHub OAuth sign-in
- `POST /api/v1/auth/signout` - Sign out
- `GET /api/v1/auth/profile` - Get user profile (requires auth)

## Database Schema

The database schema is managed through Supabase migrations in `supabase/migrations/`:
- `001_create_profiles.sql` - User profiles table

Run migrations directly in Supabase Dashboard SQL Editor or via Supabase CLI.

## Testing Strategy

- **Unit Tests**: Test each service and controller method in isolation
- **E2E Tests**: Test complete API flows including authentication
- **Test Naming**: Use Arrange-Act-Assert pattern
- **Test Variables**: Follow convention: `inputX`, `mockX`, `actualX`, `expectedX`

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to dev/main:
1. Install dependencies with pnpm
2. Generate Prisma client (if using Prisma)
3. Run linting
4. Check formatting
5. Build application
6. Run unit tests
7. Run E2E tests
8. Generate coverage report

## Important Notes

- **Node.js Version**: Requires Node.js 22+ and pnpm 9+
- **Package Manager**: Must use pnpm (enforced by packageManager field)
- **Security**: Never commit `.env` files with real values
- **JWT Secret**: The SUPABASE_JWT_SECRET must match your Supabase project's JWT secret
- **GitHub OAuth**: Callback URL must be configured in both GitHub OAuth App and Supabase
- **Rate Limiting**: Adjust throttle limits in app.module.ts based on your needs

## Common Issues & Solutions

1. **Port Already in Use**: Change port via `PORT` environment variable
2. **Supabase Connection Failed**: Verify environment variables and project status
3. **Type Generation Fails**: Ensure SUPABASE_PROJECT_ID is set correctly
4. **GitHub OAuth Not Working**: Check callback URL matches in GitHub and Supabase settings