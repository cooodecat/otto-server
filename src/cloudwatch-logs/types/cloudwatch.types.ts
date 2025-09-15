export interface RawLogEntry {
  timestamp: Date;
  message: string;
  logStream: string;
  eventId: string;
}

export interface CloudWatchLogEvent {
  timestamp?: number;
  message?: string;
  ingestionTime?: number;
  eventId?: string;
}

export interface CodeBuildLogInfo {
  logGroupName: string;
  logStreamName: string;
  buildId: string;
  projectName: string;
}

export interface LogQueryOptions {
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  nextToken?: string;
}

export interface LogQueryResult {
  logs: RawLogEntry[];
  nextToken?: string;
  hasMore: boolean;
}

export interface CloudWatchConfig {
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  sessionToken?: string | undefined;
}
