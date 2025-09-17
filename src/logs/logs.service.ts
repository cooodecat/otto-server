import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CloudWatchLogsService } from '../cloudwatch-logs/cloudwatch-logs.service';
import { RawLogEntry } from '../cloudwatch-logs/types/cloudwatch.types';
import { CodeBuildService } from '../codebuild/codebuild.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TimeRangeType } from './dto/analytics.dto';

/**
 * CloudWatch Logs API에서 가져온 단일 로그 이벤트를 나타냅니다
 */
interface LogEvent {
  /** 로그 이벤트가 발생한 Unix 타임스탬프 */
  timestamp: number;
  /** 실제 로그 메시지 내용 */
  message: string;
  /** CloudWatch에 로그가 수집된 Unix 타임스탬프 */
  ingestionTime: number;
}

/**
 * 서버에서 파싱/정규화한 로그 이벤트
 */
interface NormalizedLogEvent {
  /** 이벤트 시각 (ms) */
  ts: number;
  /** 원본 메시지 (마스킹/정규화 가능) */
  message: string;
  /** 로그 소스 태그 (예: Container, CodeBuild 등) */
  source?: string;
  /** 수준 */
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'UNKNOWN';
  /** CodeBuild 단계 (예: INSTALL, PRE_BUILD, BUILD, POST_BUILD, FINAL) */
  phase?: string;
  /** Phase context status code 등 에러 코드 */
  code?: string;
  /** 빌드 상태 힌트 */
  buildStatus?:
    | 'SUCCEEDED'
    | 'FAILED'
    | 'STOPPED'
    | 'TIMED_OUT'
    | 'IN_PROGRESS'
    | 'UNKNOWN';
}

/**
 * CloudWatch Logs API의 RawLogEntry를 LogEvent 형식으로 변환합니다
 *
 * CloudWatch API 응답 형식을 일관성과 캐싱을 위해 로그 서비스에서
 * 사용하는 내부 LogEvent 형식으로 변환합니다.
 *
 * @param rawEntry - CloudWatch Logs API에서 가져온 원본 로그 엔트리
 * @returns Unix 타임스탬프가 포함된 변환된 LogEvent
 *
 * @example
 * ```typescript
 * const rawEntry: RawLogEntry = {
 *   timestamp: new Date('2024-01-15T10:30:45.123Z'),
 *   message: '[Container] 2024/01/15 10:30:45 Running command npm install',
 *   logStream: 'my-project/12345678-1234-1234-1234-123456789012',
 *   eventId: '37516444617598064848979944537842033274675012345'
 * };
 *
 * const logEvent = convertToLogEvent(rawEntry);
 * // 결과: { timestamp: 1642248645123, message: '[Container]...', ingestionTime: 1642248645123 }
 * ```
 */
function convertToLogEvent(rawEntry: RawLogEntry): LogEvent {
  return {
    timestamp: rawEntry.timestamp.getTime(),
    message: rawEntry.message,
    ingestionTime: rawEntry.timestamp.getTime(),
  };
}

/**
 * LogEvent를 NormalizedLogEvent로 변환 (간단한 정규식 기반)
 * CodeBuild 표준 로그 패턴만 가볍게 파싱합니다.
 */
function normalizeLogEvent(event: LogEvent): NormalizedLogEvent {
  const msg = event.message || '';

  // [Source] 접두사 추출
  let source: string | undefined;
  const srcMatch = msg.match(/^\[(?<src>[^\]]+)\]\s*/);
  if (srcMatch && srcMatch.groups?.src) {
    source = srcMatch.groups.src.trim();
  }

  // Level 추론
  const lower = msg.toLowerCase();
  let level: NormalizedLogEvent['level'] = 'INFO';
  if (/(error|failed)/i.test(msg)) level = 'ERROR';
  else if (/(warn|warning)/i.test(msg)) level = 'WARN';
  else if (/debug/i.test(msg)) level = 'DEBUG';
  else level = 'INFO';

  // Phase/Status/Code 추출
  let phase: string | undefined;
  let buildStatus: NormalizedLogEvent['buildStatus'] | undefined;
  let code: string | undefined;

  // Entering phase X
  const enterPhase = msg.match(/Entering phase\s+([A-Z_]+)/i);
  if (enterPhase) phase = enterPhase[1].toUpperCase();

  // Phase complete: X State: Y
  const phaseComplete = msg.match(
    /Phase complete:\s*([A-Z_]+)\s*State:\s*([A-Z_]+)/i,
  );
  if (phaseComplete) {
    phase = phaseComplete[1].toUpperCase();
    const st = phaseComplete[2].toUpperCase();
    if (st === 'SUCCEEDED') buildStatus = 'IN_PROGRESS';
    if (st === 'FAILED') buildStatus = 'FAILED';
  }

  // BUILD SUCCEEDED/FAILED (요약)
  if (/BUILD\s+SUCCEEDED/i.test(msg)) buildStatus = 'SUCCEEDED';
  if (/BUILD\s+FAILED/i.test(msg)) buildStatus = 'FAILED';

  // Phase context status code: CODE
  const codeMatch = msg.match(/Phase context status code:\s*([A-Z0-9_-]+)/i);
  if (codeMatch) code = codeMatch[1];

  return {
    ts: event.timestamp,
    message: msg,
    source,
    level,
    phase,
    code,
    buildStatus: buildStatus || 'UNKNOWN',
  };
}

/**
 * 빌드 로그 수집 상태를 관리하기 위한 내부 데이터 구조
 */
interface BuildLogData {
  /** 빌드의 고유 식별자 */
  buildId: string;
  /** 이 빌드에 대한 CloudWatch 로그 스트림 이름 */
  logStreamName: string;
  /** 로그 수집을 계속하기 위한 페이지네이션 토큰 */
  lastToken?: string;
  /** 마지막 새 로그가 관측된 시각(ms) */
  lastLogAt?: number;
  /** 마지막 상태 점검 시각(ms) */
  lastStatusCheckAt?: number;
  /** 연속 오류 횟수 */
  consecutiveErrors?: number;
  /** 백오프 종료 시각(ms). 현재 시간이 이 값보다 작으면 호출 스킵 */
  backoffUntil?: number;
  /** 메모리에 캐시된 로그 이벤트들 */
  logs: LogEvent[];
  /** 로그 수집이 현재 활성화되어 있는지 여부 */
  isActive: boolean;
}

/**
 * AWS CloudWatch Logs에서 실시간 로그 수집 및 스트리밍을 담당하는 핵심 서비스
 *
 * 이 서비스는 다음과 같은 포괄적인 로그 수집 시스템을 구현합니다:
 * - **주기적 수집**: CloudWatch Logs API에서 5초마다 새로운 로그 이벤트 수집
 * - **로그 캐싱**: 설정 가능한 크기 제한으로 메모리에 로그 캐시 (빌드당 1000개 엔트리)
 * - **실시간 스트리밍**: Server-Sent Events(SSE)를 통해 프론트엔드 클라이언트에 실시간 로그 전송
 * - **오류 처리**: 포괄적인 오류 로깅 및 처리
 * - **리소스 관리**: 적절한 정리 및 메모리 관리를 통한 효율적인 리소스 관리
 *
 * ## 주요 기능
 *
 * ### 🔄 주기적 로그 수집
 * - `setInterval`을 사용하여 5초마다 CloudWatch API 폴링
 * - `nextForwardToken`을 통한 페이지네이션으로 중복 로그 방지
 * - CodeBuild ID를 CloudWatch 로그 스트림으로 자동 해결
 *
 * ### 💾 메모리 관리
 * - 빌드당 최근 1000개 로그 엔트리의 순환 버퍼 유지
 * - 비활성 빌드 및 인터벌 자동 정리
 * - 적절한 라이프사이클 관리를 통한 메모리 누수 방지
 *
 * ### 🚀 실시간 스트리밍
 * - 수집 즉시 SSE를 통해 새 로그 브로드캐스트
 * - 여러 동시 빌드 로그 스트림 지원
 * - 효율적인 이벤트 배포를 위한 RxJS Observable 패턴 사용
 *
 * ### 🛡️ 오류 복원력
 * - 서비스 중단 없는 포괄적인 오류 로깅
 * - CloudWatch 서비스 통합을 통한 자동 재시도 로직
 *
 * ## 사용 예시
 *
 * ### 기본 사용법
 * ```typescript
 * // CodeBuild 로그 수집 시작
 * await logsService.startLogCollection('otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83');
 *
 * // 모든 캐시된 로그 가져오기
 * const logs = logsService.getBuildLogs('otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83');
 *
 * // 빌드 완료 시 수집 중지
 * logsService.stopLogCollection('otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83');
 * ```
 *
 * ### 프론트엔드 통합
 * ```javascript
 * // 실시간 로그 스트림에 연결
 * const eventSource = new EventSource('/api/v1/logs/builds/my-build/stream');
 * eventSource.onmessage = (event) => {
 *   const logData = JSON.parse(event.data);
 *   displayNewLogs(logData.events);
 * };
 * ```
 *
 * ## 아키텍처 통합
 *
 * ```
 * CloudWatch Logs API ←── LogsService ←── LogsController ←── Frontend
 *                              ↓              ↓              ↑
 *                         Memory Cache → SSE Stream ──────────┘
 *                              ↓
 * ```
 *
 * @see CloudWatchLogsService 직접적인 CloudWatch API 접근을 위해
 * @see LogsController REST API 및 SSE 엔드포인트를 위해
 */
@Injectable()
export class LogsService implements OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  /** 빌드 로그 데이터 및 수집 상태를 저장하는 맵 */
  private buildLogs: Map<string, BuildLogData> = new Map();
  /** 각 빌드에 대한 활성 폴링 인터벌을 저장하는 맵 */
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  /** 로그 수집 시도 간격 (5초) */
  private readonly POLL_INTERVAL = 5000;
  /** 메모리 문제를 방지하기 위해 빌드당 캐시할 최대 로그 수 */
  private readonly MAX_CACHED_LOGS = 1000;

  /** SSE 이벤트 발생을 위한 LogsController 참조 */
  private logsController: any;

  // 폴링 제어 상수
  private readonly IDLE_STATUS_CHECK_MS = 30_000; // 최근 로그 없을 때 상태 점검 간격
  private readonly MAX_BACKOFF_MS = 60_000; // 최대 백오프 60초

  constructor(
    private readonly cloudWatchLogsService: CloudWatchLogsService,
    private readonly codeBuildService: CodeBuildService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * 특정 빌드에 대한 주기적 로그 수집을 시작합니다
   *
   * CloudWatch Logs API에서 5초마다 새로운 로그 이벤트를 가져오는
   * 폴링 메커니즘을 생성합니다. 토큰을 사용하여 페이지네이션을 자동으로
   * 처리하고 빠른 접근을 위해 로그를 메모리에 캐시합니다.
   *
   * @param buildId - CodeBuild ID (예: 'otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83')
   * @param logGroupName - CloudWatch 로그 그룹 이름 (선택사항, 하위 호환성을 위해)
   * @param logStreamName - CloudWatch 로그 스트림 이름 (선택사항, 하위 호환성을 위해)
   *
   * @example
   * ```typescript
   * // 새로운 방식: CodeBuild ID만 사용
   * await logsService.startLogCollection('otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83');
   *
   * // 기존 방식: 로그 그룹과 스트림을 명시적으로 지정 (Mock 서비스용)
   * await logsService.startLogCollection('build-123', '/aws/codebuild/my-project', 'build-stream-001');
   * ```
   *
   * @throws CodeBuild를 찾을 수 없거나 로그 접근에 실패할 경우 오류를 로깅합니다
   */
  async startLogCollection(buildId: string): Promise<void> {
    this.logger.log(`Starting log collection for build: ${buildId}`);

    // 기존 수집이 있다면 중지
    this.stopLogCollection(buildId);

    // 빌드 로그 데이터 초기화
    const buildLogData: BuildLogData = {
      buildId,
      logStreamName: 'auto-resolved', // CloudWatch API가 자동으로 해결
      logs: [],
      isActive: true,
    };
    this.buildLogs.set(buildId, buildLogData);

    // 주기적 로그 수집 시작 (5초마다)
    const interval = setInterval(() => {
      void this.collectLogs(buildId);
    }, this.POLL_INTERVAL);

    this.intervals.set(buildId, interval);

    // 초기 로그 수집 (즉시 실행)
    await this.collectLogs(buildId);
  }

  /**
   * 특정 빌드에 대한 로그 수집을 중지합니다
   *
   * 폴링 인터벌을 해제하고 빌드를 비활성으로 표시합니다.
   * 캐시된 로그는 서비스가 재시작될 때까지 사용 가능한 상태로 남아있습니다.
   *
   * @param buildId - 중지할 빌드의 고유 식별자
   *
   * @example
   * ```typescript
   * logsService.stopLogCollection('build-123');
   * ```
   */
  stopLogCollection(buildId: string): void {
    const interval = this.intervals.get(buildId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(buildId);
    }

    const buildData = this.buildLogs.get(buildId);
    if (buildData) {
      buildData.isActive = false;
    }

    this.logger.log(`Stopped log collection for build: ${buildId}`);
  }

  /**
   * CloudWatch Logs API에서 실제 로그 수집을 수행하는 내부 메소드
   *
   * setInterval을 통해 5초마다 실행되어 새로운 로그 이벤트를 수집하는
   * 핵심 메소드입니다. 페이지네이션 토큰을 사용하여 새로운 로그만 가져오도록 하여
   * 효율적인 메모리 사용량을 유지하고 중복 처리를 방지합니다.
   *
   * **주요 기능:**
   * - `nextForwardToken`을 사용한 자동 페이지네이션
   * - 설정 가능한 캐시 제한을 통한 메모리 관리
   * - 연결된 클라이언트로의 실시간 SSE 브로드캐스팅
   * - API 실패 시 Mock 서비스로 자동 폴백
   * - 수집 사이클을 중단하지 않는 우아한 오류 처리
   *
   * **처리 흐름:**
   * 1. 빌드가 여전히 활성 상태인지 확인
   * 2. 페이지네이션 토큰과 함께 CloudWatch API 호출
   * 3. 새로운 로그 이벤트를 변환하고 캐시
   * 4. 다음 수집을 위한 페이지네이션 토큰 업데이트
   * 5. SSE를 통해 새 로그 브로드캐스트
   * 6. CloudWatch 실패 시 Mock 서비스로 폴백
   *
   * @param buildId - CodeBuild ID (예: 'otto-codebuild-project:fa21d195-132c-4721-bd14-f618c0044a83')
   * @param logGroupName - CloudWatch 로그 그룹 이름 (선택사항, Mock 서비스와의 하위 호환성을 위해)
   * @param logStreamName - CloudWatch 로그 스트림 이름 (선택사항, Mock 서비스와의 하위 호환성을 위해)
   *
   * @example
   * ```typescript
   * // setInterval에 의해 5초마다 자동으로 호출됨
   * const interval = setInterval(async () => {
   *   await this.collectLogs(buildId, logGroupName, logStreamName);
   * }, this.POLL_INTERVAL);
   * ```
   *
   * @throws 오류를 로깅하지만 서비스 안정성을 위해 예외를 던지지 않습니다
   * @private
   */
  private async collectLogs(buildId: string): Promise<void> {
    try {
      const buildData = this.buildLogs.get(buildId);
      if (!buildData || !buildData.isActive) {
        return;
      }

      // 백오프 중이면 스킵
      if (buildData.backoffUntil && Date.now() < buildData.backoffUntil) {
        return;
      }

      // CloudWatch API를 사용하여 로그 수집
      const result = await this.cloudWatchLogsService.getLogsPaginated(
        buildId,
        {
          limit: 100, // 한 번에 최대 100개 로그 수집
          nextToken: buildData.lastToken,
        },
      );

      // 토큰은 신규 로그가 없어도 항상 갱신 (중복/비효율 방지)
      buildData.lastToken = result.nextToken;

      if (result.logs.length > 0) {
        // RawLogEntry를 LogEvent로 변환
        const newLogEvents: LogEvent[] = result.logs.map(convertToLogEvent);
        const normalized: NormalizedLogEvent[] = newLogEvents.map((e) =>
          normalizeLogEvent(e),
        );

        // 새 로그를 캐시에 추가
        buildData.logs.push(...newLogEvents);

        // 캐시 크기 제한
        if (buildData.logs.length > this.MAX_CACHED_LOGS) {
          buildData.logs = buildData.logs.slice(-this.MAX_CACHED_LOGS);
        }

        // 마지막 활동 시각 업데이트 및 오류 카운터 초기화
        buildData.lastLogAt = Date.now();
        buildData.consecutiveErrors = 0;
        buildData.backoffUntil = undefined;

        this.logger.debug(
          `Collected ${result.logs.length} new log events for build: ${buildId}`,
        );

        // SSE로 새 로그를 프론트엔드에 전송 (정규화 포함)
        this.notifyNewLogs(buildId, newLogEvents, normalized);
      } else {
        this.logger.debug(`No new logs for build: ${buildId}`);

        // 유휴 상태가 일정 시간 지속되면 빌드 터미널 상태 확인 후 자동 중단
        const now = Date.now();
        const lastActivity = buildData.lastLogAt || now;
        const shouldCheck =
          !buildData.lastStatusCheckAt ||
          now - buildData.lastStatusCheckAt >= this.IDLE_STATUS_CHECK_MS;
        if (shouldCheck && now - lastActivity >= this.IDLE_STATUS_CHECK_MS) {
          buildData.lastStatusCheckAt = now;
          await this.checkAndAutoStopIfTerminal(buildId);
        }
      }
    } catch (error) {
      this.logger.error(`Error collecting logs for build ${buildId}:`, error);
      // 연속 오류 지수 백오프
      const buildData = this.buildLogs.get(buildId);
      if (buildData) {
        buildData.consecutiveErrors = (buildData.consecutiveErrors || 0) + 1;
        const base = this.POLL_INTERVAL;
        const backoff = Math.min(
          base * Math.pow(2, (buildData.consecutiveErrors || 1) - 1),
          this.MAX_BACKOFF_MS,
        );
        buildData.backoffUntil = Date.now() + backoff;
        this.logger.warn(
          `Backoff for build ${buildId}: ${backoff}ms (errors=${buildData.consecutiveErrors})`,
        );
      }
    }
  }

  /**
   * 특정 빌드에 대한 모든 캐시된 로그 이벤트를 가져옵니다
   *
   * 빌드에 대해 메모리에 저장된 전체 로그 히스토리를 반환합니다.
   * REST API 엔드포인트에서 클라이언트에 로그 데이터를 제공하는 데 사용됩니다.
   *
   * @param buildId - 빌드의 고유 식별자
   * @returns 로그 이벤트 배열, 빌드를 찾을 수 없으면 빈 배열
   *
   * @example
   * ```typescript
   * const logs = logsService.getBuildLogs('build-123');
   * console.log(`${logs.length}개의 로그 엔트리를 찾았습니다`);
   * ```
   */
  getBuildLogs(buildId: string): LogEvent[] {
    const buildData = this.buildLogs.get(buildId);
    return buildData ? buildData.logs : [];
  }

  /**
   * 특정 빌드에 대한 가장 최근 로그 이벤트들을 가져옵니다
   *
   * 캐시된 로그에서 마지막 N개의 로그 이벤트를 반환합니다.
   * 전체 로그 히스토리를 로드하지 않고 최근 활동을 표시하는 데 유용합니다.
   *
   * @param buildId - 빌드의 고유 식별자
   * @param limit - 반환할 최근 로그의 최대 개수 (기본값: 100)
   * @returns 가장 최근 로그 이벤트들의 배열
   *
   * @example
   * ```typescript
   * const recentLogs = logsService.getRecentLogs('build-123', 50);
   * console.log(`마지막 ${recentLogs.length}개의 로그 엔트리`);
   * ```
   */
  getRecentLogs(buildId: string, limit: number = 100): LogEvent[] {
    const buildData = this.buildLogs.get(buildId);
    if (!buildData) {
      return [];
    }
    return buildData.logs.slice(-limit);
  }

  // 빌드 상태 확인
  isBuildActive(buildId: string): boolean {
    const buildData = this.buildLogs.get(buildId);
    return buildData ? buildData.isActive : false;
  }

  // 활성 빌드 목록 조회
  getActiveBuilds(): string[] {
    return Array.from(this.buildLogs.entries())
      .filter(([, data]) => data.isActive)
      .map(([buildId]) => buildId);
  }

  /**
   * 연결된 SSE 클라이언트들에게 새로운 로그 이벤트를 실시간으로 브로드캐스트합니다
   *
   * CloudWatch API 또는 Mock 서비스에서 새로운 로그 이벤트가 수집될 때마다
   * 호출되는 메소드입니다. LogsController를 사용하여 이 특정 빌드의 로그 스트림을
   * 구독하고 있는 모든 연결된 클라이언트에게 Server-Sent Events(SSE)를 통해
   * 이벤트를 전송합니다.
   *
   * **SSE와의 통합:**
   * - 이벤트 브로드캐스팅을 위한 RxJS Subject 패턴 사용
   * - 타겟팅된 전달을 위해 buildId로 이벤트 필터링
   * - 실시간 업데이트를 위한 지속적인 HTTP 연결 유지
   * - 클라이언트 연결 해제 자동 처리
   *
   * @param buildId - 로그가 브로드캐스트되는 빌드의 고유 식별자
   * @param newEvents - 연결된 클라이언트들에게 브로드캐스트할 새로운 로그 이벤트 배열
   *
   * @example
   * ```typescript
   * // 새 로그 수집 후 자동으로 호출됨
   * if (result.logs.length > 0) {
   *   const newLogEvents = result.logs.map(convertToLogEvent);
   *   this.notifyNewLogs(buildId, newLogEvents);
   * }
   * ```
   *
   * @example
   * ```javascript
   * // 프론트엔드에서 EventSource를 통해 이벤트 수신
   * const eventSource = new EventSource('/api/v1/logs/builds/my-build/stream');
   * eventSource.onmessage = (event) => {
   *   const data = JSON.parse(event.data);
   *   console.log(`빌드 ${data.buildId}에 대해 ${data.events.length}개의 새 로그를 받았습니다`);
   * };
   * ```
   *
   * @see LogsController.emitLogEvent SSE 전송 구현을 위해
   * @private
   */
  private notifyNewLogs(
    buildId: string,
    newEvents: LogEvent[],
    normalized?: NormalizedLogEvent[],
  ): void {
    this.logger.debug(
      `New logs available for build ${buildId}: ${newEvents.length} events`,
    );

    // SSE를 통해 실시간으로 프론트엔드에 전송
    if (
      this.logsController &&
      typeof this.logsController.emitLogEvent === 'function'
    ) {
      this.logsController.emitLogEvent(buildId, newEvents, normalized);
    }
  }

  /**
   * SSE 이벤트 발생을 위한 LogsController 참조를 설정합니다
   *
   * 이 메소드는 LogsService와 LogsController 간의 순환 의존성을
   * 해결합니다. 두 서비스가 인스턴스화된 후 컨트롤러가 자신을
   * 등록할 수 있도록 합니다. 컨트롤러 참조는 새로운 로그 이벤트가
   * 수집될 때 SSE 이벤트를 발생시키는 데 사용됩니다.
   *
   * **순환 의존성 패턴:**
   * ```
   * LogsService는 LogsController가 필요함 (SSE 발생을 위해)
   *     ↓
   * LogsController는 LogsService가 필요함 (로그 작업을 위해)
   * ```
   *
   * **해결 방법:**
   * 1. 두 서비스가 독립적으로 생성됨
   * 2. LogsController가 생성자에서 이 메소드를 호출
   * 3. LogsService가 이제 컨트롤러를 통해 SSE 이벤트를 발생시킬 수 있음
   *
   * @param controller - emitLogEvent 메소드를 가진 LogsController 인스턴스
   *
   * @example
   * ```typescript
   * // LogsController 생성자에서
   * constructor(private readonly logsService: LogsService) {
   *   this.logsService.setLogsController(this);
   * }
   * ```
   *
   * @see LogsController.constructor 사용법을 위해
   * @internal 이 메소드는 LogsController에서만 내부적으로 사용됩니다
   */
  setLogsController(controller: any): void {
    this.logsController = controller;
  }

  /**
   * NestJS 모듈이 파괴될 때 호출되는 정리 메소드
   *
   * 이 라이프사이클 훅은 모든 활성 로그 수집 인터벌과 리소스의 적절한 정리를
   * 보장하여 메모리 누수와 좀비 프로세스를 방지합니다. NestJS에 의해 애플리케이션
   * 종료 시 또는 개발 중 모듈 핫 리로드 시 자동으로 호출됩니다.
   *
   * **정리 작업:**
   * - 모든 활성 setInterval 타이머 해제
   * - 메모리에서 인터벌 참조 제거
   * - 디버깅을 위한 정리 활동 로깅
   * - 애플리케이션 재시작 시 리소스 누수 방지
   *
   * @example
   * ```typescript
   * // NestJS 라이프사이클에 의해 자동으로 호출됨
   * // 수동 호출 불필요
   *
   * // 정리 전: 3개의 활성 빌드 인터벌
   * // 정리 후: 0개의 활성 인터벌, 모든 타이머 해제됨
   * ```
   *
   * @implements {OnModuleDestroy} from '@nestjs/common'
   * @see https://docs.nestjs.com/fundamentals/lifecycle-events#lifecycle-events
   */
  onModuleDestroy(): void {
    this.logger.log('Cleaning up log collection intervals...');
    for (const [, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * CodeBuild 상태가 터미널 상태이면 자동 중단합니다
   */
  private async checkAndAutoStopIfTerminal(buildId: string): Promise<void> {
    try {
      const status = await this.codeBuildService.getBuildStatus(buildId);
      const s = (status.buildStatus || '').toUpperCase();
      const isTerminal = [
        'SUCCEEDED',
        'FAILED',
        'STOPPED',
        'TIMED_OUT',
      ].includes(s);
      if (isTerminal) {
        this.logger.log(
          `Build ${buildId} reached terminal state ${s}. Stopping log collection and archiving.`,
        );

        // 로그를 DB에 아카이빙
        await this.archiveToDatabase(buildId);

        // 로그 수집 중지
        this.stopLogCollection(buildId);
      }
    } catch (e) {
      this.logger.warn(
        `Failed to check build terminal status for ${buildId}: ${String(e)}`,
      );
    }
  }

  /**
   * 메모리에 캐시된 로그를 Supabase DB에 아카이빙합니다
   *
   * 빌드가 완료되면 메모리에 저장된 로그를 log_archives 테이블에 저장합니다.
   * JSONB 형식으로 전체 로그를 저장하여 향후 조회가 가능하도록 합니다.
   *
   * @param buildId - AWS CodeBuild ID (예: 'otto-codebuild-project:uuid')
   * @returns 아카이빙 성공 여부
   */
  async archiveToDatabase(buildId: string): Promise<boolean> {
    try {
      const buildData = this.buildLogs.get(buildId);
      if (!buildData || buildData.logs.length === 0) {
        this.logger.warn(`No logs to archive for build: ${buildId}`);
        return false;
      }

      // build_histories 테이블에서 build_history_id 찾기
      const { data: buildHistory, error: bhError } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .select('id, project_id, user_id')
        .eq('aws_build_id', buildId)
        .single();

      if (bhError || !buildHistory) {
        this.logger.error(
          `Failed to find build history for ${buildId}:`,
          bhError,
        );
        return false;
      }

      // 로그 분석 (에러, 경고 카운트)
      let errorCount = 0;
      let warningCount = 0;
      let infoCount = 0;
      const errorMessages: string[] = [];

      buildData.logs.forEach((log) => {
        const message = log.message || '';
        if (/\b(ERROR|FAILED|FAILURE)\b/i.test(message)) {
          errorCount++;
          if (errorMessages.length < 10) {
            errorMessages.push(message.substring(0, 200));
          }
        } else if (/\b(WARN|WARNING)\b/i.test(message)) {
          warningCount++;
        } else if (/\b(INFO|SUCCESS)\b/i.test(message)) {
          infoCount++;
        }
      });

      // 타임스탬프 추출
      const timestamps = buildData.logs
        .map((log) => log.timestamp)
        .filter((ts) => ts);
      const firstTimestamp =
        timestamps.length > 0 ? Math.min(...timestamps) : null;
      const lastTimestamp =
        timestamps.length > 0 ? Math.max(...timestamps) : null;

      // log_archives 테이블에 저장
      const { error: archiveError } = await this.supabaseService
        .getClient()
        .from('log_archives')
        .upsert(
          {
            build_history_id: buildHistory.id,
            s3_bucket: null, // DB 직접 저장 방식이므로 S3 정보 없음
            s3_key_prefix: null,
            s3_export_task_id: null,
            export_status: 'completed',
            total_log_lines: buildData.logs.length,
            error_count: errorCount,
            warning_count: warningCount,
            info_count: infoCount,
            file_size_bytes: JSON.stringify(buildData.logs).length, // 대략적인 크기
            archived_files: buildData.logs, // 전체 로그를 JSONB로 저장
            error_summary: errorMessages.length > 0 ? errorMessages : null,
            first_log_timestamp: firstTimestamp
              ? new Date(firstTimestamp).toISOString()
              : null,
            last_log_timestamp: lastTimestamp
              ? new Date(lastTimestamp).toISOString()
              : null,
            export_started_at: new Date().toISOString(),
            export_completed_at: new Date().toISOString(),
          },
          {
            onConflict: 'build_history_id',
          },
        );

      if (archiveError) {
        this.logger.error(
          `Failed to archive logs for ${buildId}:`,
          archiveError,
        );
        return false;
      }

      this.logger.log(
        `Successfully archived ${buildData.logs.length} logs for build: ${buildId}`,
      );

      // 메모리에서 로그 제거 (옵션)
      // this.buildLogs.delete(buildId);

      return true;
    } catch (error) {
      this.logger.error(`Error archiving logs for ${buildId}:`, error);
      return false;
    }
  }

  /**
   * DB에 아카이빙된 로그를 조회합니다
   *
   * log_archives 테이블에서 특정 빌드의 아카이빙된 로그를 가져옵니다.
   *
   * @param buildId - AWS CodeBuild ID
   * @returns 아카이빙된 로그 데이터
   */
  async getArchivedLogs(buildId: string): Promise<{
    logs: LogEvent[];
    metadata?: {
      totalLines: number;
      errorCount: number;
      warningCount: number;
      exportCompletedAt: string;
    };
  } | null> {
    try {
      // build_histories에서 id 찾기
      const { data: buildHistory, error: bhError } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .select('id')
        .eq('aws_build_id', buildId)
        .single();

      if (bhError || !buildHistory) {
        this.logger.warn(`Build history not found for ${buildId}`);
        return null;
      }

      // log_archives에서 조회
      const { data: archive, error: archiveError } = await this.supabaseService
        .getClient()
        .from('log_archives')
        .select('*')
        .eq('build_history_id', buildHistory.id)
        .single();

      if (archiveError || !archive) {
        this.logger.warn(`No archived logs found for ${buildId}`);
        return null;
      }

      // archived_files가 JSONB 배열로 저장된 로그들
      const logs = (archive.archived_files as LogEvent[]) || [];

      return {
        logs,
        metadata: {
          totalLines: archive.total_log_lines || 0,
          errorCount: archive.error_count || 0,
          warningCount: archive.warning_count || 0,
          exportCompletedAt: archive.export_completed_at || '',
        },
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving archived logs for ${buildId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * 통합 로그 조회 - 실시간/아카이브 자동 선택 (페이지네이션, 필터링 지원)
   *
   * 빌드가 활성 상태면 메모리에서, 완료된 빌드면 DB에서 조회합니다.
   *
   * @param buildId - AWS CodeBuild ID
   * @param options - 쿼리 옵션 (페이지네이션, 필터링, 검색)
   * @returns 로그 데이터 (소스 정보 포함)
   */
  async getUnifiedLogs(
    buildId: string,
    options?: {
      limit?: number;
      offset?: number;
      levels?: string[];
      search?: string;
      regex?: boolean;
      timeRange?: string;
    },
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
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    // 먼저 메모리 캐시 확인
    const buildData = this.buildLogs.get(buildId);

    if (buildData?.isActive) {
      // 실행 중인 빌드: 메모리에서 조회
      let filteredLogs = [...buildData.logs];

      // 레벨 필터링
      if (options?.levels && options.levels.length > 0) {
        const levelsUpper = options.levels.map((l) => l.toUpperCase());
        filteredLogs = filteredLogs.filter((log) => {
          const normalized = normalizeLogEvent(log);
          return levelsUpper.includes(normalized.level);
        });
      }

      // 검색 필터링
      if (options?.search) {
        if (options.regex) {
          try {
            const regex = new RegExp(options.search, 'i');
            filteredLogs = filteredLogs.filter((log) =>
              regex.test(log.message),
            );
          } catch (e) {
            this.logger.warn(`Invalid regex pattern: ${options.search}`);
            // 일반 텍스트 검색으로 폴백
            const searchLower = options.search.toLowerCase();
            filteredLogs = filteredLogs.filter((log) =>
              log.message.toLowerCase().includes(searchLower),
            );
          }
        } else {
          const searchLower = options.search.toLowerCase();
          filteredLogs = filteredLogs.filter((log) =>
            log.message.toLowerCase().includes(searchLower),
          );
        }
      }

      // 시간 범위 필터링
      if (options?.timeRange && options.timeRange !== 'all') {
        const now = Date.now();
        let timeLimit = 0;

        switch (options.timeRange) {
          case '1h':
            timeLimit = now - 60 * 60 * 1000;
            break;
          case '24h':
            timeLimit = now - 24 * 60 * 60 * 1000;
            break;
          case '7d':
            timeLimit = now - 7 * 24 * 60 * 60 * 1000;
            break;
          case '30d':
            timeLimit = now - 30 * 24 * 60 * 60 * 1000;
            break;
        }

        if (timeLimit > 0) {
          filteredLogs = filteredLogs.filter(
            (log) => log.timestamp >= timeLimit,
          );
        }
      }

      // 페이지네이션 적용
      const total = filteredLogs.length;
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      return {
        source: 'realtime',
        logs: paginatedLogs,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    }

    // 완료된 빌드: DB에서 조회 (확장된 옵션 지원)
    const archived = await this.getArchivedLogsWithFilters(buildId, options);

    if (archived) {
      return {
        source: 'archive',
        logs: archived.logs,
        metadata: archived.metadata,
        pagination: archived.pagination,
      };
    }

    // 둘 다 없으면 빈 배열 반환
    return {
      source: 'realtime',
      logs: [],
      pagination: {
        total: 0,
        limit,
        offset,
        hasMore: false,
      },
    };
  }

  /**
   * DB에서 필터링된 아카이브 로그 조회
   */
  private async getArchivedLogsWithFilters(
    buildId: string,
    options?: {
      limit?: number;
      offset?: number;
      levels?: string[];
      search?: string;
      regex?: boolean;
      timeRange?: string;
    },
  ): Promise<{
    logs: LogEvent[];
    metadata?: any;
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  } | null> {
    try {
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;

      // 기존 getArchivedLogs 로직 활용
      const fullArchive = await this.getArchivedLogs(buildId);
      if (!fullArchive) {
        return null;
      }

      let filteredLogs = [...fullArchive.logs];

      // 레벨 필터링
      if (options?.levels && options.levels.length > 0) {
        const levelsUpper = options.levels.map((l) => l.toUpperCase());
        filteredLogs = filteredLogs.filter((log) => {
          const normalized = normalizeLogEvent(log);
          return levelsUpper.includes(normalized.level);
        });
      }

      // 검색 필터링
      if (options?.search) {
        if (options.regex) {
          try {
            const regex = new RegExp(options.search, 'i');
            filteredLogs = filteredLogs.filter((log) =>
              regex.test(log.message),
            );
          } catch (e) {
            this.logger.warn(`Invalid regex pattern: ${options.search}`);
            const searchLower = options.search.toLowerCase();
            filteredLogs = filteredLogs.filter((log) =>
              log.message.toLowerCase().includes(searchLower),
            );
          }
        } else {
          const searchLower = options.search.toLowerCase();
          filteredLogs = filteredLogs.filter((log) =>
            log.message.toLowerCase().includes(searchLower),
          );
        }
      }

      // 시간 범위 필터링
      if (options?.timeRange && options.timeRange !== 'all') {
        const now = Date.now();
        let timeLimit = 0;

        switch (options.timeRange) {
          case '1h':
            timeLimit = now - 60 * 60 * 1000;
            break;
          case '24h':
            timeLimit = now - 24 * 60 * 60 * 1000;
            break;
          case '7d':
            timeLimit = now - 7 * 24 * 60 * 60 * 1000;
            break;
          case '30d':
            timeLimit = now - 30 * 24 * 60 * 60 * 1000;
            break;
        }

        if (timeLimit > 0) {
          filteredLogs = filteredLogs.filter(
            (log) => log.timestamp >= timeLimit,
          );
        }
      }

      // 페이지네이션 적용
      const total = filteredLogs.length;
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      return {
        logs: paginatedLogs,
        metadata: fullArchive.metadata,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving filtered archived logs for ${buildId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * 빌드 완료 시 호출되는 메서드 (외부에서 명시적으로 호출 가능)
   *
   * BuildsService에서 빌드 상태가 완료로 업데이트될 때 호출됩니다.
   *
   * @param buildId - AWS CodeBuild ID
   */
  async handleBuildComplete(buildId: string): Promise<void> {
    try {
      // 로그 아카이빙
      await this.archiveToDatabase(buildId);

      // 로그 수집 중지
      this.stopLogCollection(buildId);

      // 선택적: 메모리에서 제거 (일정 시간 후)
      setTimeout(() => {
        this.buildLogs.delete(buildId);
        this.logger.debug(
          `Removed cached logs for completed build: ${buildId}`,
        );
      }, 60000); // 1분 후 제거
    } catch (error) {
      this.logger.error(
        `Error handling build completion for ${buildId}:`,
        error,
      );
    }
  }

  /**
   * 빌드 메타데이터 조회
   *
   * 빌드의 상세 정보, 단계별 상태, 메트릭 등을 조회합니다.
   *
   * @param buildId - AWS CodeBuild ID
   * @returns 빌드 메타데이터
   */
  async getBuildMetadata(buildId: string): Promise<{
    buildId: string;
    buildNumber?: number;
    status: string;
    trigger: {
      type: string;
      author?: string;
      timestamp?: string;
    };
    repository: {
      branch?: string;
      commitHash?: string;
      commitMessage?: string;
    };
    phases: Array<{
      name: string;
      status: string;
      startTime?: string;
      endTime?: string;
      duration?: string;
    }>;
    metrics: {
      totalLines: number;
      errorCount: number;
      warningCount: number;
      infoCount: number;
      fileSize: number;
    };
    isArchived: boolean;
    archivedAt?: string;
    startTime?: string;
    endTime?: string;
    duration?: string;
    projectId?: string;
    userId?: string;
    logsUrl?: string;
    errorMessage?: string;
  } | null> {
    try {
      // 1. build_histories 조회
      const { data: buildHistory, error: bhError } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .select('*')
        .eq('aws_build_id', buildId)
        .single();

      if (bhError || !buildHistory) {
        this.logger.warn(`Build history not found for ${buildId}`);
        return null;
      }

      // 2. build_execution_phases 조회
      const { data: phases } = await this.supabaseService
        .getClient()
        .from('build_execution_phases')
        .select('*')
        .eq('build_history_id', buildHistory.id)
        .order('created_at', { ascending: true });

      // 3. log_archives 조회 (메트릭용)
      const { data: archive } = await this.supabaseService
        .getClient()
        .from('log_archives')
        .select('*')
        .eq('build_history_id', buildHistory.id)
        .single();

      // 4. 빌드 상태 매핑
      let status = 'UNKNOWN';
      const execStatus = buildHistory.build_execution_status?.toUpperCase();
      if (execStatus === 'SUCCEEDED') status = 'SUCCESS';
      else if (execStatus === 'FAILED') status = 'FAILED';
      else if (execStatus === 'STOPPED') status = 'STOPPED';
      else if (execStatus === 'IN_PROGRESS') status = 'RUNNING';
      else if (execStatus === 'PENDING') status = 'PENDING';

      // 5. 트리거 정보 추출 (build_spec에서)
      const buildSpec = buildHistory.build_spec;
      const envVars = buildHistory.environment_variables;

      let triggerType = 'Manual';
      let triggerAuthor = buildHistory.user_id;

      // GitHub 트리거 감지
      if (envVars?.GITHUB_EVENT_NAME === 'push') {
        triggerType = 'GitHub Push';
        triggerAuthor = envVars.GITHUB_ACTOR || triggerAuthor;
      }

      // 6. 리포지토리 정보 추출
      const repository = {
        branch: envVars?.GITHUB_REF_NAME || envVars?.BRANCH_NAME,
        commitHash: envVars?.GITHUB_SHA || envVars?.COMMIT_ID,
        commitMessage: envVars?.COMMIT_MESSAGE,
      };

      // 7. 단계별 정보 매핑
      const phasesData = (phases || []).map((phase) => ({
        name: phase.phase_type,
        status: phase.phase_status,
        startTime: phase.phase_start_time,
        endTime: phase.phase_end_time,
        duration: phase.phase_duration_seconds
          ? `${phase.phase_duration_seconds}s`
          : undefined,
      }));

      // 8. 메트릭 정보
      const metrics = {
        totalLines: archive?.total_log_lines || 0,
        errorCount: archive?.error_count || 0,
        warningCount: archive?.warning_count || 0,
        infoCount: archive?.info_count || 0,
        fileSize: archive?.file_size_bytes || 0,
      };

      // 9. 기간 계산
      let duration: string | undefined;
      if (buildHistory.duration_seconds) {
        const minutes = Math.floor(buildHistory.duration_seconds / 60);
        const seconds = buildHistory.duration_seconds % 60;
        duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }

      return {
        buildId,
        buildNumber: undefined, // 빌드 번호는 별도 관리 필요
        status,
        trigger: {
          type: triggerType,
          author: triggerAuthor,
          timestamp: buildHistory.created_at,
        },
        repository,
        phases: phasesData,
        metrics,
        isArchived: !!archive,
        archivedAt: archive?.export_completed_at,
        startTime: buildHistory.start_time,
        endTime: buildHistory.end_time,
        duration,
        projectId: buildHistory.project_id,
        userId: buildHistory.user_id,
        logsUrl: buildHistory.logs_url,
        errorMessage: buildHistory.build_error_message,
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving build metadata for ${buildId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * 로그 검색 기능 - 정규식과 컨텍스트 지원
   *
   * @param buildId - AWS CodeBuild ID
   * @param searchOptions - 검색 옵션
   * @returns 검색 결과와 컨텍스트
   */
  async searchLogs(
    buildId: string,
    searchOptions: {
      query: string;
      regex?: boolean;
      levels?: string[];
      timeRange?: { start?: string; end?: string };
      includeContext?: boolean;
      contextLines?: number;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    results: Array<{
      lineNumber: number;
      timestamp: number;
      level?: string;
      message: string;
      matches?: Array<{ start: number; end: number }>;
      context?: {
        before: Array<{ lineNumber: number; message: string }>;
        after: Array<{ lineNumber: number; message: string }>;
      };
    }>;
    totalMatches: number;
    searchTime: number;
    query: string;
    regex: boolean;
  }> {
    const startTime = Date.now();

    // 통합 로그 가져오기 (전체)
    const unifiedLogs = await this.getUnifiedLogs(buildId, {
      limit: 999999, // 모든 로그
      offset: 0,
    });

    if (!unifiedLogs.logs || unifiedLogs.logs.length === 0) {
      return {
        results: [],
        totalMatches: 0,
        searchTime: Date.now() - startTime,
        query: searchOptions.query,
        regex: searchOptions.regex || false,
      };
    }

    const results: Array<any> = [];
    const logs = unifiedLogs.logs;
    let searchPattern: RegExp | string;

    // 검색 패턴 준비
    if (searchOptions.regex) {
      try {
        searchPattern = new RegExp(searchOptions.query, 'gi');
      } catch (e) {
        this.logger.warn(`Invalid regex pattern: ${searchOptions.query}`);
        searchPattern = searchOptions.query.toLowerCase();
      }
    } else {
      searchPattern = searchOptions.query.toLowerCase();
    }

    // 로그 검색
    logs.forEach((log, index) => {
      // 레벨 필터링
      if (searchOptions.levels && searchOptions.levels.length > 0) {
        const normalized = normalizeLogEvent(log);
        if (
          !searchOptions.levels
            .map((l) => l.toUpperCase())
            .includes(normalized.level)
        ) {
          return;
        }
      }

      // 시간 범위 필터링
      if (searchOptions.timeRange) {
        const logTime = log.timestamp;
        if (searchOptions.timeRange.start) {
          const startTime = new Date(searchOptions.timeRange.start).getTime();
          if (logTime < startTime) return;
        }
        if (searchOptions.timeRange.end) {
          const endTime = new Date(searchOptions.timeRange.end).getTime();
          if (logTime > endTime) return;
        }
      }

      // 검색 매칭
      let matches: Array<{ start: number; end: number }> = [];
      let isMatch = false;

      if (searchPattern instanceof RegExp) {
        const allMatches = [
          ...log.message.matchAll(new RegExp(searchPattern.source, 'gi')),
        ];
        if (allMatches.length > 0) {
          isMatch = true;
          matches = allMatches.map((match) => ({
            start: match.index || 0,
            end: (match.index || 0) + match[0].length,
          }));
        }
      } else {
        const lowerMessage = log.message.toLowerCase();
        const searchIndex = lowerMessage.indexOf(searchPattern);
        if (searchIndex !== -1) {
          isMatch = true;
          matches = [
            {
              start: searchIndex,
              end: searchIndex + searchOptions.query.length,
            },
          ];
        }
      }

      if (isMatch) {
        const normalized = normalizeLogEvent(log);
        const result: any = {
          lineNumber: index + 1,
          timestamp: log.timestamp,
          level: normalized.level,
          message: log.message,
          matches,
        };

        // 컨텍스트 추가
        if (searchOptions.includeContext) {
          const contextLines = searchOptions.contextLines || 3;
          const before: Array<{ lineNumber: number; message: string }> = [];
          const after: Array<{ lineNumber: number; message: string }> = [];

          // 이전 컨텍스트
          for (let i = Math.max(0, index - contextLines); i < index; i++) {
            before.push({
              lineNumber: i + 1,
              message: logs[i].message,
            });
          }

          // 이후 컨텍스트
          for (
            let i = index + 1;
            i < Math.min(logs.length, index + contextLines + 1);
            i++
          ) {
            after.push({
              lineNumber: i + 1,
              message: logs[i].message,
            });
          }

          result.context = { before, after };
        }

        results.push(result);
      }
    });

    // 페이지네이션 적용
    const limit = searchOptions.limit || 100;
    const offset = searchOptions.offset || 0;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      results: paginatedResults,
      totalMatches: results.length,
      searchTime: Date.now() - startTime,
      query: searchOptions.query,
      regex: searchOptions.regex || false,
    };
  }

  /**
   * 빌드 분석 및 통계 조회
   *
   * 지정된 기간 동안의 빌드 통계, 트렌드, 에러 패턴, 성능 메트릭 등을 분석합니다.
   *
   * @param options - 분석 옵션 (projectId, userId, timeRange, groupBy)
   * @returns 빌드 분석 결과
   */
  async getBuildAnalytics(options: {
    projectId?: string;
    userId?: string;
    timeRange: TimeRangeType;
    groupBy: 'hour' | 'day' | 'week' | 'month';
  }): Promise<{
    summary: {
      totalBuilds: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      averageDuration: string;
      totalLogLines: number;
      totalErrors: number;
      totalWarnings: number;
    };
    trends: Array<{
      timestamp: string;
      date: string;
      successCount: number;
      failedCount: number;
      averageDuration: number;
      totalBuilds: number;
    }>;
    errorPatterns: Array<{
      pattern: string;
      count: number;
      percentage: number;
      lastOccurrence: string;
      affectedBuilds: string[];
      examples: string[];
    }>;
    phaseMetrics: Array<{
      phase: string;
      totalExecutions: number;
      averageDuration: string;
      successRate: number;
      failureRate: number;
      commonErrors: string[];
    }>;
    durationDistribution: Array<{
      range: string;
      count: number;
      percentage: number;
    }>;
    topProjects?: Array<{
      projectId: string;
      projectName?: string;
      totalBuilds: number;
      successRate: number;
      averageDuration: string;
      lastBuildTime: string;
      trend: 'improving' | 'declining' | 'stable';
    }>;
    timeRange: {
      start: string;
      end: string;
      type: TimeRangeType;
    };
    generatedAt: string;
  }> {
    try {
      // 1. 시간 범위 계산
      const now = new Date();
      const timeRangeMap = {
        [TimeRangeType.TWENTY_FOUR_HOURS]: 24 * 60 * 60 * 1000,
        [TimeRangeType.SEVEN_DAYS]: 7 * 24 * 60 * 60 * 1000,
        [TimeRangeType.THIRTY_DAYS]: 30 * 24 * 60 * 60 * 1000,
        [TimeRangeType.NINETY_DAYS]: 90 * 24 * 60 * 60 * 1000,
      };
      const startTime = new Date(
        now.getTime() - timeRangeMap[options.timeRange],
      );

      // 2. 기본 쿼리 빌드
      let query = this.supabaseService
        .getClient()
        .from('build_histories')
        .select(
          `
          *,
          build_execution_phases(*)
        `,
        )
        .gte('created_at', startTime.toISOString());

      // 필터 적용
      if (options.projectId) {
        query = query.eq('project_id', options.projectId);
      }
      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }

      const { data: builds, error: buildsError } = await query;

      if (buildsError) {
        throw buildsError;
      }

      // 3. 아카이빙된 로그 메타데이터 조회
      let archiveQuery = this.supabaseService
        .getClient()
        .from('log_archives')
        .select('*')
        .gte('created_at', startTime.toISOString());

      if (options.projectId) {
        archiveQuery = archiveQuery.eq('project_id', options.projectId);
      }
      if (options.userId) {
        archiveQuery = archiveQuery.eq('user_id', options.userId);
      }

      const { data: archives } = await archiveQuery;

      // 4. Summary 통계 계산
      const totalBuilds = builds?.length || 0;
      const successCount =
        builds?.filter(
          (b) => b.build_execution_status?.toUpperCase() === 'SUCCEEDED',
        ).length || 0;
      const failedCount =
        builds?.filter(
          (b) => b.build_execution_status?.toUpperCase() === 'FAILED',
        ).length || 0;

      const durations =
        builds
          ?.map((b) => {
            if (b.build_start_time && b.build_end_time) {
              return (
                new Date(b.build_end_time).getTime() -
                new Date(b.build_start_time).getTime()
              );
            }
            return 0;
          })
          .filter((d) => d > 0) || [];

      const avgDurationMs =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      const totalLogLines =
        archives?.reduce((sum, a) => {
          const metadata = a.metadata;
          return sum + (metadata?.totalLines || 0);
        }, 0) || 0;

      const totalErrors =
        archives?.reduce((sum, a) => {
          const metadata = a.metadata;
          return sum + (metadata?.errorCount || 0);
        }, 0) || 0;

      const totalWarnings =
        archives?.reduce((sum, a) => {
          const metadata = a.metadata;
          return sum + (metadata?.warningCount || 0);
        }, 0) || 0;

      // 5. 트렌드 데이터 생성
      const trends = this.calculateTrends(builds || [], options.groupBy);

      // 6. 에러 패턴 분석 (아카이빙된 로그에서)
      const errorPatterns = this.analyzeErrorPatterns(archives || []);

      // 7. Phase 메트릭 계산
      const phaseMetrics = this.calculatePhaseMetrics(builds || []);

      // 8. Duration 분포 계산
      const durationDistribution =
        this.calculateDurationDistribution(durations);

      // 9. 상위 프로젝트 분석 (projectId가 없을 때만)
      const topProjects = !options.projectId
        ? this.analyzeTopProjects(builds || [])
        : undefined;

      return {
        summary: {
          totalBuilds,
          successCount,
          failedCount,
          successRate: totalBuilds > 0 ? (successCount / totalBuilds) * 100 : 0,
          averageDuration: this.formatDuration(avgDurationMs),
          totalLogLines,
          totalErrors,
          totalWarnings,
        },
        trends,
        errorPatterns,
        phaseMetrics,
        durationDistribution,
        topProjects,
        timeRange: {
          start: startTime.toISOString(),
          end: now.toISOString(),
          type: options.timeRange,
        },
        generatedAt: now.toISOString(),
      };
    } catch (error) {
      this.logger.error('Error generating build analytics:', error);
      throw error;
    }
  }

  /**
   * 트렌드 데이터 계산
   */
  private calculateTrends(
    builds: any[],
    groupBy: 'hour' | 'day' | 'week' | 'month',
  ): Array<{
    timestamp: string;
    date: string;
    successCount: number;
    failedCount: number;
    averageDuration: number;
    totalBuilds: number;
  }> {
    const grouped = new Map<string, any[]>();

    builds.forEach((build) => {
      const date = new Date(build.created_at);
      let key: string;

      switch (groupBy) {
        case 'hour':
          key = `${date.toISOString().slice(0, 13)}:00:00Z`;
          break;
        case 'day':
          key = date.toISOString().slice(0, 10);
          break;
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().slice(0, 10);
          break;
        }
        case 'month':
          key = date.toISOString().slice(0, 7);
          break;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(build);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, builds]) => {
        const successCount = builds.filter(
          (b) => b.build_execution_status?.toUpperCase() === 'SUCCEEDED',
        ).length;
        const failedCount = builds.filter(
          (b) => b.build_execution_status?.toUpperCase() === 'FAILED',
        ).length;

        const durations = builds
          .map((b) => {
            if (b.build_start_time && b.build_end_time) {
              return (
                new Date(b.build_end_time).getTime() -
                new Date(b.build_start_time).getTime()
              );
            }
            return 0;
          })
          .filter((d) => d > 0);

        const avgDuration =
          durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000
            : 0;

        return {
          timestamp: key,
          date: key,
          successCount,
          failedCount,
          averageDuration: Math.round(avgDuration),
          totalBuilds: builds.length,
        };
      });
  }

  /**
   * 에러 패턴 분석
   */
  private analyzeErrorPatterns(archives: any[]): Array<{
    pattern: string;
    count: number;
    percentage: number;
    lastOccurrence: string;
    affectedBuilds: string[];
    examples: string[];
  }> {
    const errorMap = new Map<
      string,
      {
        count: number;
        builds: Set<string>;
        examples: Set<string>;
        lastOccurrence: Date;
      }
    >();

    // 일반적인 에러 패턴들
    const patterns = [
      { regex: /npm ERR!.*/, name: 'NPM Error' },
      { regex: /Error:.*failed/, name: 'Build Failed' },
      { regex: /Cannot find module.*/, name: 'Module Not Found' },
      { regex: /SyntaxError:.*/, name: 'Syntax Error' },
      { regex: /TypeError:.*/, name: 'Type Error' },
      { regex: /ENOENT:.*/, name: 'File Not Found' },
      { regex: /Permission denied.*/, name: 'Permission Denied' },
      { regex: /timeout.*/, name: 'Timeout' },
      { regex: /connection.*refused/i, name: 'Connection Refused' },
      { regex: /out of memory/i, name: 'Out of Memory' },
    ];

    for (const archive of archives) {
      const logs = archive.logs as any[];
      if (!logs) continue;

      logs.forEach((log) => {
        if (typeof log.message === 'string') {
          patterns.forEach(({ regex, name }) => {
            if (regex.test(log.message)) {
              if (!errorMap.has(name)) {
                errorMap.set(name, {
                  count: 0,
                  builds: new Set(),
                  examples: new Set(),
                  lastOccurrence: new Date(archive.created_at),
                });
              }

              const entry = errorMap.get(name)!;
              entry.count++;
              entry.builds.add(archive.build_history_id);
              if (entry.examples.size < 3) {
                entry.examples.add(log.message.slice(0, 200));
              }
              if (new Date(archive.created_at) > entry.lastOccurrence) {
                entry.lastOccurrence = new Date(archive.created_at);
              }
            }
          });
        }
      });
    }

    const totalErrors = Array.from(errorMap.values()).reduce(
      (sum, e) => sum + e.count,
      0,
    );

    return Array.from(errorMap.entries())
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        percentage: totalErrors > 0 ? (data.count / totalErrors) * 100 : 0,
        lastOccurrence: data.lastOccurrence.toISOString(),
        affectedBuilds: Array.from(data.builds),
        examples: Array.from(data.examples),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Phase 메트릭 계산
   */
  private calculatePhaseMetrics(builds: any[]): Array<{
    phase: string;
    totalExecutions: number;
    averageDuration: string;
    successRate: number;
    failureRate: number;
    commonErrors: string[];
  }> {
    const phaseMap = new Map<
      string,
      {
        executions: number;
        durations: number[];
        successes: number;
        failures: number;
        errors: string[];
      }
    >();

    builds.forEach((build) => {
      const phases = build.build_execution_phases || [];
      phases.forEach((phase: any) => {
        const phaseName = phase.phase_name || 'UNKNOWN';

        if (!phaseMap.has(phaseName)) {
          phaseMap.set(phaseName, {
            executions: 0,
            durations: [],
            successes: 0,
            failures: 0,
            errors: [],
          });
        }

        const entry = phaseMap.get(phaseName)!;
        entry.executions++;

        if (phase.start_time && phase.end_time) {
          const duration =
            new Date(phase.end_time).getTime() -
            new Date(phase.start_time).getTime();
          entry.durations.push(duration);
        }

        if (phase.phase_status === 'SUCCEEDED') {
          entry.successes++;
        } else if (phase.phase_status === 'FAILED') {
          entry.failures++;
        }

        if (phase.phase_context && phase.phase_context.message) {
          entry.errors.push(phase.phase_context.message);
        }
      });
    });

    return Array.from(phaseMap.entries()).map(([phase, data]) => {
      const avgDuration =
        data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : 0;

      return {
        phase,
        totalExecutions: data.executions,
        averageDuration: this.formatDuration(avgDuration),
        successRate:
          data.executions > 0 ? (data.successes / data.executions) * 100 : 0,
        failureRate:
          data.executions > 0 ? (data.failures / data.executions) * 100 : 0,
        commonErrors: [...new Set(data.errors)].slice(0, 5),
      };
    });
  }

  /**
   * Duration 분포 계산
   */
  private calculateDurationDistribution(durations: number[]): Array<{
    range: string;
    count: number;
    percentage: number;
  }> {
    const ranges = [
      { label: '0-1m', min: 0, max: 60000 },
      { label: '1-5m', min: 60000, max: 300000 },
      { label: '5-10m', min: 300000, max: 600000 },
      { label: '10-30m', min: 600000, max: 1800000 },
      { label: '30m+', min: 1800000, max: Infinity },
    ];

    const distribution = ranges.map((range) => {
      const count = durations.filter(
        (d) => d >= range.min && d < range.max,
      ).length;
      return {
        range: range.label,
        count,
        percentage: durations.length > 0 ? (count / durations.length) * 100 : 0,
      };
    });

    return distribution;
  }

  /**
   * 상위 프로젝트 분석
   */
  private analyzeTopProjects(builds: any[]): Array<{
    projectId: string;
    projectName?: string;
    totalBuilds: number;
    successRate: number;
    averageDuration: string;
    lastBuildTime: string;
    trend: 'improving' | 'declining' | 'stable';
  }> {
    const projectMap = new Map<string, any[]>();

    builds.forEach((build) => {
      const projectId = build.project_id || 'unknown';
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, []);
      }
      projectMap.get(projectId)!.push(build);
    });

    return Array.from(projectMap.entries())
      .map(([projectId, projectBuilds]) => {
        const successCount = projectBuilds.filter(
          (b) => b.build_execution_status?.toUpperCase() === 'SUCCEEDED',
        ).length;

        const durations = projectBuilds
          .map((b) => {
            if (b.build_start_time && b.build_end_time) {
              return (
                new Date(b.build_end_time).getTime() -
                new Date(b.build_start_time).getTime()
              );
            }
            return 0;
          })
          .filter((d) => d > 0);

        const avgDuration =
          durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

        const lastBuild = projectBuilds.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0];

        // 트렌드 계산 (최근 5개 빌드 기준)
        const recentBuilds = projectBuilds
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          )
          .slice(0, 5);

        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (recentBuilds.length >= 3) {
          const recentSuccessRate =
            recentBuilds.filter(
              (b) => b.build_execution_status?.toUpperCase() === 'SUCCEEDED',
            ).length / recentBuilds.length;

          const overallSuccessRate = successCount / projectBuilds.length;

          if (recentSuccessRate > overallSuccessRate + 0.1) {
            trend = 'improving';
          } else if (recentSuccessRate < overallSuccessRate - 0.1) {
            trend = 'declining';
          }
        }

        return {
          projectId,
          projectName: lastBuild.project_name,
          totalBuilds: projectBuilds.length,
          successRate: (successCount / projectBuilds.length) * 100,
          averageDuration: this.formatDuration(avgDuration),
          lastBuildTime: lastBuild.created_at,
          trend,
        };
      })
      .sort((a, b) => b.totalBuilds - a.totalBuilds)
      .slice(0, 10);
  }

  /**
   * Duration을 사람이 읽기 쉬운 형식으로 변환
   */
  private formatDuration(ms: number): string {
    if (ms === 0) return '0s';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
