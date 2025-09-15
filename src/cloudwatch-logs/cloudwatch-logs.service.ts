import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  GetLogEventsCommandInput,
  GetLogEventsCommandOutput,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  CodeBuildClient,
  BatchGetBuildsCommand,
  BatchGetBuildsCommandInput,
  Build,
} from '@aws-sdk/client-codebuild';
import {
  RawLogEntry,
  CloudWatchLogEvent,
  CodeBuildLogInfo,
  LogQueryOptions,
  LogQueryResult,
  CloudWatchConfig,
} from './types/cloudwatch.types';
import { CloudWatchLogsRetryService } from './cloudwatch-logs-retry.service';

@Injectable()
export class CloudWatchLogsService {
  private readonly logger = new Logger(CloudWatchLogsService.name);
  private readonly cloudWatchLogsClient: CloudWatchLogsClient;
  private readonly codeBuildClient: CodeBuildClient;
  private readonly retryService: CloudWatchLogsRetryService;

  constructor(
    private readonly configService: ConfigService,
    retryService: CloudWatchLogsRetryService,
  ) {
    this.retryService = retryService;
    const config: CloudWatchConfig = {
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      sessionToken: this.configService.get<string>('AWS_SESSION_TOKEN'),
    };

    this.logger.log(`AWS Config - Region: ${config.region}`);
    this.logger.log(`AWS Config - AccessKeyId: ${config.accessKeyId?.substring(0, 10)}...`);
    this.logger.log(`AWS Config - SecretAccessKey: ${config.secretAccessKey ? '***provided***' : 'undefined'}`);
    this.logger.log(`AWS Config - SessionToken: ${config.sessionToken ? '***provided***' : 'undefined'}`);

    const credentials = config.accessKeyId && config.secretAccessKey 
      ? { 
          accessKeyId: config.accessKeyId, 
          secretAccessKey: config.secretAccessKey,
          sessionToken: config.sessionToken
        }
      : undefined;

    this.cloudWatchLogsClient = new CloudWatchLogsClient({
      region: config.region,
      credentials,
    });

    this.codeBuildClient = new CodeBuildClient({
      region: config.region,
      credentials,
    });
  }

  async getRawLogs(codebuildId: string): Promise<RawLogEntry[]> {
    const result = await this.getRawLogsInRange(codebuildId);
    return result.logs;
  }

  async getRawLogsInRange(
    codebuildId: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number,
    nextToken?: string,
  ): Promise<LogQueryResult> {
    try {
      this.logger.log(`Fetching logs for CodeBuild ID: ${codebuildId}`);

      const logInfo = await this.getCodeBuildLogInfo(codebuildId);

      const options: LogQueryOptions = {
        startTime,
        endTime,
        limit: limit || 1000,
        nextToken,
      };

      return await this.getLogsFromCloudWatch(logInfo, options);
    } catch (error) {
      this.logger.error(
        `Failed to fetch logs for CodeBuild ID ${codebuildId}:`,
        error,
      );
      throw error;
    }
  }

  private async getCodeBuildLogInfo(
    buildId: string,
  ): Promise<CodeBuildLogInfo> {
    try {
      const input: BatchGetBuildsCommandInput = {
        ids: [buildId],
      };

      const command = new BatchGetBuildsCommand(input);
      const response = await this.retryService.withRetry(
        () => this.codeBuildClient.send(command),
        { maxAttempts: 3, baseDelayMs: 1000 },
      );

      if (!response.builds || response.builds.length === 0) {
        throw new NotFoundException(`CodeBuild with ID ${buildId} not found`);
      }

      const build: Build = response.builds[0];

      if (!build.logs?.groupName || !build.logs?.streamName) {
        throw new NotFoundException(
          `Log information not available for CodeBuild ${buildId}`,
        );
      }

      return {
        logGroupName: build.logs.groupName,
        logStreamName: build.logs.streamName,
        buildId: buildId,
        projectName: build.projectName || 'unknown',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to get CodeBuild log info for ${buildId}:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve CodeBuild information',
      );
    }
  }

  private async getLogsFromCloudWatch(
    logInfo: CodeBuildLogInfo,
    options: LogQueryOptions,
  ): Promise<LogQueryResult> {
    try {
      const input: GetLogEventsCommandInput = {
        logGroupName: logInfo.logGroupName,
        logStreamName: logInfo.logStreamName,
        limit: options.limit,
        nextToken: options.nextToken,
        // Chronological order when starting fresh; when paginating with token, AWS ignores this.
        startFromHead: options.nextToken ? undefined : true,
      };

      if (options.startTime) {
        input.startTime = options.startTime.getTime();
      }

      if (options.endTime) {
        input.endTime = options.endTime.getTime();
      }

      const command = new GetLogEventsCommand(input);
      const response: GetLogEventsCommandOutput =
        await this.retryService.withRetry(
          () => this.cloudWatchLogsClient.send(command),
          { maxAttempts: 5, baseDelayMs: 2000 },
        );

      const logs: RawLogEntry[] = (response.events || []).map(
        (event, index) => ({
          timestamp: new Date(event.timestamp || 0),
          message: event.message || '',
          logStream: logInfo.logStreamName,
          // GetLogEvents does not return eventId; synthesize a stable-ish ID
          eventId: `${logInfo.logStreamName}-${event.timestamp || 0}-${index}`,
        }),
      );

      const prevToken = options.nextToken;
      const nextToken = response.nextForwardToken;
      const pageLimit = options.limit || 1000;

      return {
        logs,
        nextToken,
        // Heuristic: more pages likely if we hit the page limit and token advanced.
        hasMore:
          !!nextToken && nextToken !== prevToken && (response.events?.length || 0) >= pageLimit,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch logs from CloudWatch:`, error);
      throw new InternalServerErrorException(
        'Failed to retrieve logs from CloudWatch',
      );
    }
  }

  async getLogsPaginated(
    codebuildId: string,
    options: LogQueryOptions,
  ): Promise<LogQueryResult> {
    return await this.getRawLogsInRange(
      codebuildId,
      options.startTime,
      options.endTime,
      options.limit,
      options.nextToken,
    );
  }
}
