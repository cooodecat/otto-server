import { Injectable } from '@nestjs/common';

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
 * Response structure for GetLogEvents API call
 */
interface GetLogEventsResponse {
  /** Array of log events */
  events: LogEvent[];
  /** Token for retrieving the next batch of logs */
  nextForwardToken?: string;
}

/**
 * Mock service that simulates AWS CloudWatch Logs API behavior
 * Used for development and testing purposes when actual CloudWatch is not available
 *
 * @example
 * ```typescript
 * const response = await mockService.getLogEvents('log-group', 'log-stream');
 * console.log(response.events); // Array of log events
 * ```
 */
@Injectable()
export class LogsMockService {
  /**
   * Pre-generated mock log events to simulate a build process
   * @private
   */
  private mockLogs: LogEvent[] = [
    { timestamp: Date.now() - 60000, message: '[INFO] Build started', ingestionTime: Date.now() - 60000 },
    { timestamp: Date.now() - 55000, message: '[INFO] Installing dependencies...', ingestionTime: Date.now() - 55000 },
    { timestamp: Date.now() - 50000, message: '[INFO] npm install completed', ingestionTime: Date.now() - 50000 },
    { timestamp: Date.now() - 45000, message: '[INFO] Running build command...', ingestionTime: Date.now() - 45000 },
    { timestamp: Date.now() - 40000, message: '[WARN] Deprecated API usage detected', ingestionTime: Date.now() - 40000 },
    { timestamp: Date.now() - 35000, message: '[INFO] TypeScript compilation started', ingestionTime: Date.now() - 35000 },
    { timestamp: Date.now() - 30000, message: '[ERROR] Type error in src/main.ts:15', ingestionTime: Date.now() - 30000 },
    { timestamp: Date.now() - 25000, message: '[INFO] Type error fixed', ingestionTime: Date.now() - 25000 },
    { timestamp: Date.now() - 20000, message: '[INFO] Build completed successfully', ingestionTime: Date.now() - 20000 },
    { timestamp: Date.now() - 15000, message: '[INFO] Running tests...', ingestionTime: Date.now() - 15000 },
  ];

  /** Current index for tracking log generation */
  private currentIndex = 0;
  /** Map to store pagination tokens and their corresponding indices */
  private tokens: Map<string, number> = new Map();

  /**
   * Simulates AWS CloudWatch Logs GetLogEvents API call
   * Returns paginated log events with optional continuation token
   *
   * @param logGroupName - The name of the log group
   * @param logStreamName - The name of the log stream within the group
   * @param nextToken - Optional token for pagination (continues from previous call)
   * @returns Promise containing log events and optional next token
   *
   * @example
   * ```typescript
   * // Get initial batch of logs
   * const response = await mockService.getLogEvents('build-logs', 'stream-001');
   *
   * // Get next batch using token
   * const nextResponse = await mockService.getLogEvents(
   *   'build-logs',
   *   'stream-001',
   *   response.nextForwardToken
   * );
   * ```
   */
  async getLogEvents(
    logGroupName: string,
    logStreamName: string,
    nextToken?: string,
  ): Promise<GetLogEventsResponse> {
    const tokenKey = `${logGroupName}/${logStreamName}`;

    let startIndex = 0;
    if (nextToken && this.tokens.has(nextToken)) {
      startIndex = this.tokens.get(nextToken)!;
    }

    // 실시간 로그 시뮬레이션: 새로운 로그 이벤트 추가
    if (Math.random() > 0.3) {
      const newLog: LogEvent = {
        timestamp: Date.now(),
        message: this.generateRandomLogMessage(),
        ingestionTime: Date.now(),
      };
      this.mockLogs.push(newLog);
    }

    // 요청된 범위의 로그 반환 (최대 10개)
    const endIndex = Math.min(startIndex + 10, this.mockLogs.length);
    const events = this.mockLogs.slice(startIndex, endIndex);

    let nextForwardToken: string | undefined;
    if (endIndex < this.mockLogs.length) {
      nextForwardToken = `token_${endIndex}_${Date.now()}`;
      this.tokens.set(nextForwardToken, endIndex);
    }

    return {
      events,
      nextForwardToken,
    };
  }

  /**
   * Generates a random log message from predefined templates
   * Used to simulate real-time log generation during development
   *
   * @returns A randomly selected log message with appropriate log level
   * @private
   */
  private generateRandomLogMessage(): string {
    const messages = [
      '[INFO] Processing request...',
      '[INFO] Database connection established',
      '[WARN] High memory usage detected',
      '[ERROR] Connection timeout',
      '[INFO] Task completed successfully',
      '[DEBUG] Variable state: active',
      '[INFO] Cache cleared',
      '[WARN] Retry attempt 1/3',
      '[INFO] File uploaded successfully',
      '[ERROR] Validation failed',
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Validates whether a log stream exists and is accessible
   * Used for error simulation - returns false for streams containing 'invalid'
   *
   * @param logGroupName - The name of the log group to validate
   * @param logStreamName - The name of the log stream to validate
   * @returns Promise<boolean> - true if valid, false if invalid/nonexistent
   *
   * @example
   * ```typescript
   * const isValid = await mockService.validateLogStream('logs', 'valid-stream'); // true
   * const isInvalid = await mockService.validateLogStream('logs', 'invalid-stream'); // false
   * ```
   */
  async validateLogStream(logGroupName: string, logStreamName: string): Promise<boolean> {
    // 특정 이름에 대해 에러 시뮬레이션
    if (logGroupName.includes('nonexistent') || logStreamName.includes('invalid')) {
      return false;
    }
    return true;
  }

  /**
   * Simulates permission checking for log group access
   * Returns false for log groups containing 'restricted' to simulate access denied errors
   *
   * @param logGroupName - The name of the log group to check permissions for
   * @returns Promise<boolean> - true if access granted, false if access denied
   *
   * @example
   * ```typescript
   * const hasAccess = await mockService.checkPermissions('public-logs'); // true
   * const noAccess = await mockService.checkPermissions('restricted-logs'); // false
   * ```
   */
  async checkPermissions(logGroupName: string): Promise<boolean> {
    if (logGroupName.includes('restricted')) {
      return false;
    }
    return true;
  }
}