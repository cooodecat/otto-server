import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { CloudWatchLogsModule } from '../cloudwatch-logs/cloudwatch-logs.module';
import { CodeBuildModule } from '../codebuild/codebuild.module';
import { SupabaseModule } from '../supabase/supabase.module';

/**
 * NestJS module for build log collection and streaming functionality
 *
 * This module provides a complete solution for:
 * - Collecting logs from CloudWatch Logs API (or mock service for development)
 * - Real-time streaming of log events via Server-Sent Events (SSE)
 * - Caching logs in memory for fast access
 * - REST API endpoints for log management
 *
 * The module includes:
 * - LogsController: REST API endpoints and SSE streaming
 * - LogsService: Core business logic for log collection and caching
 * - LogsMockService: Mock CloudWatch API for development/testing
 *
 * LogsService is exported to allow other modules to programmatically
 * control log collection if needed.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [LogsModule],
 *   // ...
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [CloudWatchLogsModule, CodeBuildModule, SupabaseModule],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService], // 다른 모듈에서 사용할 수 있도록 export
})
export class LogsModule {}
