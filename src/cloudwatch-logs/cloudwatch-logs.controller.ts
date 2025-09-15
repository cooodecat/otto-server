import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { CloudWatchLogsService } from './cloudwatch-logs.service';
import { GetLogsDto } from './dto/get-logs.dto';
import { RawLogEntry, LogQueryResult } from './types/cloudwatch.types';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';

@Controller('cloudwatch-logs')
// @UseGuards(SupabaseAuthGuard) // 임시로 비활성화 - 테스트용
export class CloudWatchLogsController {
  private readonly logger = new Logger(CloudWatchLogsController.name);

  constructor(private readonly cloudWatchLogsService: CloudWatchLogsService) {}

  @Get('raw')
  async getRawLogs(@Query() query: GetLogsDto): Promise<RawLogEntry[]> {
    this.logger.log(`Getting raw logs for CodeBuild ID: ${query.codebuildId}`);

    return await this.cloudWatchLogsService.getRawLogs(query.codebuildId);
  }

  @Get('test')
  async getTestData(): Promise<RawLogEntry[]> {
    this.logger.log('Returning test data - API structure validation');

    return [
      {
        timestamp: new Date('2025-01-15T10:00:00Z'),
        message: '[PHASE_1] Starting build process',
        logStream: 'test-log-stream-1',
        eventId: 'test-event-1',
      },
      {
        timestamp: new Date('2025-01-15T10:00:01Z'),
        message: '[PHASE_1] Installing dependencies...',
        logStream: 'test-log-stream-1',
        eventId: 'test-event-2',
      },
      {
        timestamp: new Date('2025-01-15T10:00:05Z'),
        message: '[PHASE_2] Running tests...',
        logStream: 'test-log-stream-1',
        eventId: 'test-event-3',
      },
      {
        timestamp: new Date('2025-01-15T10:00:10Z'),
        message: '[PHASE_3] Build completed successfully',
        logStream: 'test-log-stream-1',
        eventId: 'test-event-4',
      },
    ];
  }

  @Get('range')
  async getRawLogsInRange(@Query() query: GetLogsDto): Promise<LogQueryResult> {
    this.logger.log(
      `Getting logs in range for CodeBuild ID: ${query.codebuildId}, ` +
        `startTime: ${query.startTime}, endTime: ${query.endTime}`,
    );

    const startTime = query.startTime ? new Date(query.startTime) : undefined;
    const endTime = query.endTime ? new Date(query.endTime) : undefined;

    return await this.cloudWatchLogsService.getLogsPaginated(
      query.codebuildId,
      {
        startTime,
        endTime,
        limit: query.limit,
        nextToken: query.nextToken,
      },
    );
  }
}
