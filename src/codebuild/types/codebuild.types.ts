import type {
  BuildPhase as AWSBuildPhase,
  LogsLocation as AWSLogsLocation,
} from '@aws-sdk/client-codebuild';

export interface BuildResponse {
  buildId: string;
  buildStatus: string;
  projectName: string;
  startTime?: Date;
}

export interface BuildStatusResponse {
  buildId: string;
  buildStatus: string;
  projectName: string;
  startTime?: Date;
  endTime?: Date;
  currentPhase?: string;
  phases?: AWSBuildPhase[];
  logs?: AWSLogsLocation;
}

export enum BuildStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  FAULT = 'FAULT',
  TIMED_OUT = 'TIMED_OUT',
  IN_PROGRESS = 'IN_PROGRESS',
  STOPPED = 'STOPPED',
}

export enum PhaseType {
  SUBMITTED = 'SUBMITTED',
  QUEUED = 'QUEUED',
  PROVISIONING = 'PROVISIONING',
  DOWNLOAD_SOURCE = 'DOWNLOAD_SOURCE',
  INSTALL = 'INSTALL',
  PRE_BUILD = 'PRE_BUILD',
  BUILD = 'BUILD',
  POST_BUILD = 'POST_BUILD',
  UPLOAD_ARTIFACTS = 'UPLOAD_ARTIFACTS',
  FINALIZING = 'FINALIZING',
  COMPLETED = 'COMPLETED',
}

export enum PhaseStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  FAULT = 'FAULT',
  TIMED_OUT = 'TIMED_OUT',
  IN_PROGRESS = 'IN_PROGRESS',
  STOPPED = 'STOPPED',
}
