import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  Sse,
  MessageEvent,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, Subject } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { LogsService } from './logs.service';
import { GetUnifiedLogsDto } from './dto/get-unified-logs.dto';
import { SearchLogsDto, SearchLogsResponse } from './dto/search-logs.dto';
import { Body } from '@nestjs/common';

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
 * Normalized log structure after server-side parsing
 */
interface NormalizedLogEvent {
  ts: number;
  message: string;
  source?: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'UNKNOWN';
  phase?: string;
  code?: string;
  buildStatus?:
    | 'SUCCEEDED'
    | 'FAILED'
    | 'STOPPED'
    | 'TIMED_OUT'
    | 'IN_PROGRESS'
    | 'UNKNOWN';
}

/**
 * Internal event structure for SSE log broadcasting
 */
interface SSELogEvent {
  /** Build identifier for the log events */
  buildId: string;
  /** Array of new log events to broadcast */
  events: LogEvent[];
  /** Server-parsed normalized logs (same order as events) */
  normalized?: NormalizedLogEvent[];
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
   * 통합 로그 조회 - 실시간/아카이브 자동 선택 (페이지네이션, 필터링 지원)
   * 
   * 빌드가 활성 상태면 메모리에서, 완료된 빌드면 DB에서 자동으로 조회합니다.
   * 
   * @param buildId - AWS CodeBuild ID
   * @param query - 쿼리 파라미터 (페이지네이션, 필터링, 검색)
   * @returns 로그 데이터와 소스 정보
   * 
   * @example
   * GET /logs/builds/123/unified?limit=50&offset=0&levels=ERROR,WARN&search=failed
   */
  @Get('builds/:buildId/unified')
  @UsePipes(new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } }))
  async getUnifiedLogs(
    @Param('buildId') buildId: string,
    @Query() query: GetUnifiedLogsDto,
  ): Promise<{
    source: 'realtime' | 'archive';
    logs: LogEvent[];
    metadata?: any;
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    return this.logsService.getUnifiedLogs(buildId, {
      limit: query.limit,
      offset: query.offset,
      levels: query.levels,
      search: query.search,
      regex: query.regex,
      timeRange: query.timeRange,
    });
  }

  /**
   * DB에 아카이빙된 로그 조회
   * 
   * log_archives 테이블에서 완료된 빌드의 로그를 조회합니다.
   * 
   * @param buildId - AWS CodeBuild ID
   * @returns 아카이빙된 로그와 메타데이터
   */
  @Get('builds/:buildId/archive')
  async getArchivedLogs(@Param('buildId') buildId: string): Promise<{
    logs: LogEvent[];
    metadata?: {
      totalLines: number;
      errorCount: number;
      warningCount: number;
      exportCompletedAt: string;
    };
  } | null> {
    return this.logsService.getArchivedLogs(buildId);
  }

  /**
   * 수동으로 로그 아카이빙 트리거
   * 
   * 빌드가 완료되었을 때 수동으로 로그를 DB에 아카이빙합니다.
   * 
   * @param buildId - AWS CodeBuild ID
   * @returns 아카이빙 성공 여부
   */
  @Post('builds/:buildId/archive')
  async archiveLogs(@Param('buildId') buildId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const success = await this.logsService.archiveToDatabase(buildId);
    return {
      success,
      message: success 
        ? `Logs archived successfully for build: ${buildId}`
        : `Failed to archive logs for build: ${buildId}`,
    };
  }

  /**
   * 로그 검색 엔드포인트 - 정규식과 컨텍스트 지원
   * 
   * 빌드 로그에서 특정 패턴을 검색하고 매칭된 결과와 주변 컨텍스트를 반환합니다.
   * 
   * @param buildId - AWS CodeBuild ID
   * @param searchDto - 검색 옵션
   * @returns 검색 결과와 컨텍스트
   * 
   * @example
   * POST /logs/builds/123/search
   * {
   *   "query": "error|failed",
   *   "regex": true,
   *   "levels": ["ERROR"],
   *   "includeContext": true,
   *   "contextLines": 5
   * }
   */
  @Post('builds/:buildId/search')
  @UsePipes(new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } }))
  async searchLogs(
    @Param('buildId') buildId: string,
    @Body() searchDto: SearchLogsDto,
  ): Promise<SearchLogsResponse> {
    return this.logsService.searchLogs(buildId, {
      query: searchDto.query,
      regex: searchDto.regex,
      levels: searchDto.levels,
      timeRange: searchDto.timeRange,
      includeContext: searchDto.includeContext,
      contextLines: searchDto.contextLines,
      limit: searchDto.limit,
      offset: searchDto.offset,
    });
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
          normalized: event.normalized,
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
          normalized: event.normalized,
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
  emitLogEvent(
    buildId: string,
    events: LogEvent[],
    normalized?: NormalizedLogEvent[],
  ): void {
    this.logEventSubject.next({ buildId, events, normalized });
  }
}
