import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CloudWatchLogsService } from '../cloudwatch-logs/cloudwatch-logs.service';
import { RawLogEntry } from '../cloudwatch-logs/types/cloudwatch.types';

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
 * 빌드 로그 수집 상태를 관리하기 위한 내부 데이터 구조
 */
interface BuildLogData {
  /** 빌드의 고유 식별자 */
  buildId: string;
  /** 이 빌드에 대한 CloudWatch 로그 스트림 이름 */
  logStreamName: string;
  /** 로그 수집을 계속하기 위한 페이지네이션 토큰 */
  lastToken?: string;
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

  constructor(private readonly cloudWatchLogsService: CloudWatchLogsService) {}

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

      // CloudWatch API를 사용하여 로그 수집
      const result = await this.cloudWatchLogsService.getLogsPaginated(
        buildId,
        {
          limit: 100, // 한 번에 최대 100개 로그 수집
          nextToken: buildData.lastToken,
        },
      );

      if (result.logs.length > 0) {
        // RawLogEntry를 LogEvent로 변환
        const newLogEvents: LogEvent[] = result.logs.map(convertToLogEvent);

        // 새 로그를 캐시에 추가
        buildData.logs.push(...newLogEvents);

        // 캐시 크기 제한
        if (buildData.logs.length > this.MAX_CACHED_LOGS) {
          buildData.logs = buildData.logs.slice(-this.MAX_CACHED_LOGS);
        }

        // 토큰 업데이트
        buildData.lastToken = result.nextToken;

        this.logger.debug(
          `Collected ${result.logs.length} new log events for build: ${buildId}`,
        );

        // SSE로 새 로그를 프론트엔드에 전송
        this.notifyNewLogs(buildId, newLogEvents);
      } else {
        this.logger.debug(`No new logs for build: ${buildId}`);
      }
    } catch (error) {
      this.logger.error(`Error collecting logs for build ${buildId}:`, error);
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
  private notifyNewLogs(buildId: string, newEvents: LogEvent[]): void {
    this.logger.debug(
      `New logs available for build ${buildId}: ${newEvents.length} events`,
    );

    // SSE를 통해 실시간으로 프론트엔드에 전송
    if (
      this.logsController &&
      typeof this.logsController.emitLogEvent === 'function'
    ) {
      this.logsController.emitLogEvent(buildId, newEvents);
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
}
