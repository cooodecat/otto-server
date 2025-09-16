import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, Subject } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { LogsService } from './logs.service';

/**
 * Represents a single log event from CloudWatch Logs API
 */
interface LogEvent {
  /** Unix timestamp when the log event occurred */
  timestamp: number;
  /** The actual log message content */
  message: string;
  /** Unix timestamp when the log was ingested by CloudWatch */
  ingestionTime: number;
}

/**
 * Internal event structure for SSE log broadcasting
 */
interface SSELogEvent {
  /** Build identifier for the log events */
  buildId: string;
  /** Array of new log events to broadcast */
  events: LogEvent[];
}

/**
 * REST API controller for managing build log collection and streaming
 *
 * Provides endpoints for:
 * - Starting/stopping log collection for builds
 * - Retrieving cached log data
 * - Real-time log streaming via Server-Sent Events (SSE)
 * - Build status monitoring
 *
 * All endpoints are prefixed with `/api/v1/logs` as configured in NestJS routing.
 *
 * @example
 * ```typescript
 * // Start log collection
 * POST /api/v1/logs/builds/my-build/start?logGroup=group&logStream=stream
 *
 * // Get logs via SSE
 * GET /api/v1/logs/builds/my-build/stream
 * ```
 */
@Controller('logs')
export class LogsController {
  /** RxJS Subject for broadcasting log events to SSE clients */
  private logEventSubject = new Subject<SSELogEvent>();

  constructor(private readonly logsService: LogsService) {
    // LogsService에 컨트롤러 참조 설정 (순환 의존성 해결)
    this.logsService.setLogsController(this);
  }

  /**
   * Starts log collection for a specific build
   *
   * Initiates periodic polling of CloudWatch Logs API for the specified build.
   * The service will collect new log events every 5 seconds and cache them in memory.
   *
   * @param buildId - CodeBuild ID (e.g., 'otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83')
   * @param logGroupName - CloudWatch log group name (optional, for backward compatibility)
   * @param logStreamName - CloudWatch log stream name (optional, for backward compatibility)
   * @returns Confirmation message
   *
   * @example
   * ```bash
   * # New way: Just use CodeBuild ID
   * curl -X POST "http://localhost:4000/api/v1/logs/builds/otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83/start"
   *
   * # Old way: Specify log group and stream (for mock testing)
   * curl -X POST "http://localhost:4000/api/v1/logs/builds/my-build/start?logGroup=build-logs&logStream=stream-001"
   * ```
   */
  @Post('builds/:buildId/start')
  async startLogCollection(
    @Param('buildId') buildId: string,
  ): Promise<{ message: string }> {
    await this.logsService.startLogCollection(buildId);
    return { message: `Log collection started for build: ${buildId}` };
  }

  // 빌드 로그 수집 중지
  @Post('builds/:buildId/stop')
  stopLogCollection(@Param('buildId') buildId: string): { message: string } {
    this.logsService.stopLogCollection(buildId);
    return { message: `Log collection stopped for build: ${buildId}` };
  }

  // 빌드 로그 히스토리 조회 (REST API)
  @Get('builds/:buildId')
  getBuildLogs(@Param('buildId') buildId: string): LogEvent[] {
    return this.logsService.getBuildLogs(buildId);
  }

  // 빌드 최근 로그 조회
  @Get('builds/:buildId/recent')
  getRecentLogs(
    @Param('buildId') buildId: string,
    @Query('limit') limit?: string,
  ): LogEvent[] {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.logsService.getRecentLogs(buildId, limitNum);
  }

  // 빌드 상태 확인
  @Get('builds/:buildId/status')
  getBuildStatus(@Param('buildId') buildId: string): {
    buildId: string;
    isActive: boolean;
  } {
    return {
      buildId,
      isActive: this.logsService.isBuildActive(buildId),
    };
  }

  // 활성 빌드 목록 조회
  @Get('builds/active')
  getActiveBuilds(): { activeBuilds: string[] } {
    return {
      activeBuilds: this.logsService.getActiveBuilds(),
    };
  }

  /**
   * Server-Sent Events endpoint for real-time log streaming
   *
   * Provides a persistent HTTP connection that streams log events in real-time
   * as they are collected from CloudWatch Logs API. Uses EventSource compatible format.
   *
   * @param buildId - Unique identifier for the build to stream logs from
   * @returns Observable stream of log events formatted for SSE
   *
   * @example
   * ```javascript
   * // Frontend JavaScript
   * const eventSource = new EventSource('/api/v1/logs/builds/my-build/stream');
   * eventSource.onmessage = (event) => {
   *   const logData = JSON.parse(event.data);
   *   console.log('New logs:', logData.events);
   * };
   * ```
   *
   * @example
   * ```bash
   * # Test with curl
   * curl -N "http://localhost:4001/api/v1/logs/builds/my-build/stream"
   * ```
   */
  @Sse('builds/:buildId/stream')
  logStream(@Param('buildId') buildId: string): Observable<MessageEvent> {
    return this.logEventSubject.asObservable().pipe(
      filter((event) => event.buildId === buildId),
      map((event) => ({
        type: 'log-event',
        data: JSON.stringify({
          buildId: event.buildId,
          events: event.events,
          timestamp: Date.now(),
        }),
      })),
    );
  }

  // SSE 엔드포인트: 모든 빌드의 실시간 로그 스트림
  @Sse('stream/all')
  allLogsStream(): Observable<MessageEvent> {
    return this.logEventSubject.asObservable().pipe(
      map((event) => ({
        type: 'log-event',
        data: JSON.stringify({
          buildId: event.buildId,
          events: event.events,
          timestamp: Date.now(),
        }),
      })),
    );
  }

  /**
   * Emits log events to all connected SSE clients
   *
   * Called by LogsService when new log events are collected.
   * Broadcasts the events to all SSE streams subscribed to the specific build.
   *
   * @param buildId - Build identifier for the log events
   * @param events - Array of new log events to broadcast
   *
   * @example
   * ```typescript
   * // Called internally by LogsService
   * controller.emitLogEvent('build-123', newLogEvents);
   * ```
   */
  emitLogEvent(buildId: string, events: LogEvent[]): void {
    this.logEventSubject.next({ buildId, events });
  }
}
