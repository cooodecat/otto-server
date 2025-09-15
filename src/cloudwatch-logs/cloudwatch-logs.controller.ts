import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { CloudWatchLogsService } from './cloudwatch-logs.service';
import { GetLogsDto } from './dto/get-logs.dto';
import { RawLogEntry, LogQueryResult } from './types/cloudwatch.types';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';

@Controller('api/v1/cloudwatch-logs')
@UseGuards(SupabaseAuthGuard)
export class CloudWatchLogsController {
  private readonly logger = new Logger(CloudWatchLogsController.name);

  constructor(private readonly cloudWatchLogsService: CloudWatchLogsService) {}

  @Get('raw')
  async getRawLogs(@Query() query: GetLogsDto): Promise<RawLogEntry[]> {
    this.logger.log(`Getting raw logs for CodeBuild ID: ${query.codebuildId}`);

    return await this.cloudWatchLogsService.getRawLogs(query.codebuildId);
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
