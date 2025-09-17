# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Otto Server is a comprehensive NestJS backend API server that provides CI/CD platform capabilities. It integrates with AWS CodeBuild for build automation, CloudWatch Logs for monitoring, GitHub for repository management, and Supabase for authentication and database operations. The project follows clean architecture patterns with modular structure, TypeScript strict typing, and comprehensive testing.

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
pnpm db:types              # Generate TypeScript types from Supabase schema
pnpm db:setup              # Setup Supabase database
pnpm db:reset              # Reset Supabase database
pnpm db:migrate            # Push schema changes to Supabase
pnpm db:diff               # Show schema differences
pnpm db:link               # Link to Supabase project
```

## Architecture & Code Structure

### Module Organization
- **app.module.ts**: Root module with global configuration (ConfigModule, ThrottlerModule)
- **auth/**: Authentication module with GitHub OAuth via Supabase
- **supabase/**: Core Supabase integration module
  - `supabase.service.ts`: Main service for Supabase operations
  - `guards/supabase-auth.guard.ts`: JWT authentication guard
  - `strategies/supabase-jwt.strategy.ts`: Passport JWT strategy
- **projects/**: Project management module
  - `controllers/project.controller.ts`: Project CRUD operations
  - `services/project.service.ts`: Project business logic
  - `dto/project.dto.ts`: Project data transfer objects
- **builds/**: Build management and status tracking
- **codebuild/**: AWS CodeBuild integration for CI/CD pipelines
  - `codebuild.service.ts`: CodeBuild API integration
  - `codebuild.controller.ts`: Build operations endpoints
  - `types/codebuild.types.ts`: CodeBuild-specific types
- **cloudwatch-logs/**: AWS CloudWatch Logs integration for monitoring
- **github-integration/**: GitHub API integration (repositories, webhooks)
- **pipeline/**: Pipeline configuration and management
- **logs/**: Application logging and monitoring
- **profiles/**: User profile management
- **types/**: TypeScript type definitions
  - `database.types.ts`: Supabase schema types (auto-generated)
  - `auth.types.ts`: Authentication-related types
  - `pipeline.types.ts`: Pipeline-specific types
  - `request.types.ts`: Request/response types

### Key Architectural Decisions
1. **Modular Architecture**: Each domain has its own module with controller, service, and types
2. **CI/CD Platform**: Full integration with AWS CodeBuild for automated builds and deployments
3. **Monitoring & Logging**: AWS CloudWatch Logs integration for comprehensive monitoring
4. **GitHub Integration**: Complete GitHub API integration for repository management and webhooks
5. **Supabase Integration**: Uses Supabase for authentication (GitHub OAuth) and database operations
6. **JWT Authentication**: Passport.js with custom Supabase JWT strategy
7. **Rate Limiting**: Three-tier throttling (short: 3/sec, medium: 20/10sec, long: 100/min)
8. **Environment Configuration**: Multi-environment support with `.env.{NODE_ENV}` files
9. **Project Management**: Full CRUD operations for project lifecycle management

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

# GitHub OAuth & Integration
OTTO_GITHUB_CLIENT_ID=[github-client-id]
OTTO_GITHUB_OAUTH_SECRET=[github-oauth-secret]
GITHUB_APP_ID=[github-app-id]
GITHUB_PRIVATE_KEY=[github-private-key-pem]
GITHUB_WEBHOOK_SECRET=[webhook-secret]

# AWS Configuration
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=[aws-access-key]
AWS_SECRET_ACCESS_KEY=[aws-secret-key]

# CORS
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

### Environment Files Priority
1. `.env.{NODE_ENV}` (e.g., `.env.dev`, `.env.production`)
2. `.env` (fallback)

## API Endpoints

### Core
- `GET /` - Health check

### Authentication
- `POST /auth/signout` - Sign out (requires auth)
- `GET /auth/profile` - Get user profile (requires auth)
- `GET /auth/github/profile` - Get GitHub profile (requires auth)
- `POST /auth/refresh` - Refresh access token
- `GET /auth/session` - Get current session (requires auth)

### Projects
- `GET /projects` - Get user projects (requires auth)
- `GET /projects/:id` - Get project detail (requires auth)
- `POST /projects/with-github` - Create project with GitHub integration (requires auth)
- `PATCH /projects/:id` - Update project (requires auth)
- `DELETE /projects/:id` - Delete project (requires auth)
- `POST /projects/:id/retry-codebuild` - Retry CodeBuild for project (requires auth)

### Builds & CI/CD
- `GET /builds` - Get build history (requires auth)
- `GET /codebuild/*` - AWS CodeBuild integration endpoints (requires auth)
- `GET /pipeline/*` - Pipeline management endpoints (requires auth)

### Monitoring & Logs
- `GET /logs/*` - Application logs endpoints (requires auth)
- `GET /cloudwatch-logs/*` - AWS CloudWatch Logs endpoints (requires auth)

### GitHub Integration
- `GET /github-integration/*` - GitHub API integration endpoints (requires auth)

## Database Schema

The database schema is managed through Supabase migrations in `supabase/migrations/` directory. The schema includes tables for:
- User profiles and authentication
- Project management and metadata
- Build history and status tracking
- Pipeline configurations
- GitHub integration data

Run migrations using the provided npm scripts:
- `pnpm db:migrate` - Push schema changes to Supabase
- `pnpm db:reset` - Reset database to initial state
- `pnpm db:types` - Generate TypeScript types from current schema

## Testing Strategy

- **Unit Tests**: Test each service and controller method in isolation
- **E2E Tests**: Test complete API flows including authentication
- **Test Naming**: Use Arrange-Act-Assert pattern
- **Test Variables**: Follow convention: `inputX`, `mockX`, `actualX`, `expectedX`

## CI/CD Integration

This server provides CI/CD capabilities through:

### AWS CodeBuild Integration
- Automated build triggers via GitHub webhooks
- Build status tracking and monitoring
- Custom build configurations per project
- Integration with AWS CloudWatch for logging

### GitHub Integration
- Repository management and access
- Webhook handling for automated builds
- GitHub App authentication for enhanced permissions
- Pull request and commit status updates

### Pipeline Management
- Visual pipeline configuration
- Build step definitions and dependencies
- Environment-specific deployment configurations

## Key Dependencies

- **Core Framework**: `@nestjs/common`, `@nestjs/core` (v11.x)
- **Authentication**: `@nestjs/passport`, `passport-jwt`, `@nestjs/jwt`
- **Database**: `@supabase/supabase-js` (v2.57.x)
- **AWS Integration**: `@aws-sdk/client-codebuild`, `@aws-sdk/client-cloudwatch-logs`
- **GitHub Integration**: `@octokit/rest`, `@octokit/auth-app`
- **Validation**: `class-validator`, `class-transformer`
- **Rate Limiting**: `@nestjs/throttler` (v6.x)
- **Configuration**: `@nestjs/config` (v4.x)
- **Security**: `helmet`, `cookie-parser`
- **Testing**: `jest`, `supertest`, `@nestjs/testing`
- **Development**: `typescript` (v5.7.x), `typescript-eslint` (v8.x), `prettier`

## Important Notes

- **Node.js Version**: Requires Node.js 22+ and pnpm 9+
- **Package Manager**: Must use pnpm (enforced by packageManager field)
- **Security**: Never commit `.env` files with real values
- **AWS Setup**: Requires AWS credentials for CodeBuild and CloudWatch integration
- **GitHub App**: Requires GitHub App setup for advanced integration features
- **JWT Secret**: The SUPABASE_JWT_SECRET must match your Supabase project's JWT secret
- **Database**: Uses Supabase PostgreSQL with auto-generated TypeScript types
- **Rate Limiting**: Adjust throttle limits in app.module.ts based on your needs

## Common Issues & Solutions

1. **Port Already in Use**: Change port via `PORT` environment variable
2. **Supabase Connection Failed**: Verify environment variables and project status
3. **Type Generation Fails**: Ensure SUPABASE_PROJECT_ID is set correctly and run `pnpm db:link`
4. **GitHub OAuth Not Working**: Check callback URL matches in GitHub and Supabase settings
5. **AWS CodeBuild Integration Issues**: Verify AWS credentials and region configuration
6. **GitHub App Setup**: Ensure private key is properly formatted and GitHub App permissions are correct
7. **Build Failures**: Check CloudWatch Logs for detailed error messages via the logs endpoints