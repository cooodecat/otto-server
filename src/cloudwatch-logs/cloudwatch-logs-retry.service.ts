import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBackoff?: boolean;
}

@Injectable()
export class CloudWatchLogsRetryService {
  private readonly logger = new Logger(CloudWatchLogsRetryService.name);

  async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      exponentialBackoff = true,
    } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxAttempts) {
          this.logger.error(
            `Operation failed after ${maxAttempts} attempts:`,
            lastError.stack,
          );
          throw lastError;
        }

        if (!this.isRetryableError(error)) {
          this.logger.error(
            'Non-retryable error encountered:',
            lastError.stack,
          );
          throw lastError;
        }

        const delay = this.calculateDelay(
          attempt,
          baseDelayMs,
          maxDelayMs,
          exponentialBackoff,
        );

        this.logger.warn(
          `Attempt ${attempt} failed, retrying in ${delay}ms. Error: ${lastError.message}`,
        );

        await this.delay(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const errorObj = error as {
      name?: string;
      code?: string;
      message?: string;
      statusCode?: number;
    };

    const retryableCodes = [
      'ThrottlingException',
      'TooManyRequestsException',
      'ServiceUnavailableException',
      'InternalServerError',
      'RequestTimeout',
    ];

    const retryableMessages = [
      'Rate exceeded',
      'Too Many Requests',
      'Service Unavailable',
      'Internal Server Error',
      'Timeout',
      'Connection',
    ];

    const errorCode = errorObj.name || errorObj.code || '';
    const errorMessage = errorObj.message || '';

    return (
      retryableCodes.some((code) => errorCode.includes(code)) ||
      retryableMessages.some((msg) => errorMessage.includes(msg)) ||
      (typeof errorObj.statusCode === 'number' && errorObj.statusCode >= 500)
    );
  }

  private calculateDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    exponentialBackoff: boolean,
  ): number {
    let delay = baseDelayMs;

    if (exponentialBackoff) {
      delay = baseDelayMs * Math.pow(2, attempt - 1);
    }

    const jitter = Math.random() * 0.1 * delay;
    delay += jitter;

    return Math.min(delay, maxDelayMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
