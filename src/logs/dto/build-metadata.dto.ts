/**
 * Build metadata response DTO
 */
export interface BuildPhaseDto {
  name: string;
  status: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
}

export interface BuildTriggerDto {
  type: string; // 'Manual' | 'GitHub Push' | 'Scheduled' | 'Unknown' 등
  author?: string;
  timestamp?: string;
}

export interface BuildRepositoryDto {
  branch?: string;
  commitHash?: string;
  commitMessage?: string;
}

export interface BuildMetricsDto {
  totalLines: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  fileSize: number; // bytes
}

export interface BuildMetadataResponseDto {
  buildId: string;
  buildNumber?: number;
  status: string; // 'SUCCESS' | 'FAILED' | 'RUNNING' | 'PENDING' | 'STOPPED' | 'UNKNOWN' 등
  trigger: BuildTriggerDto;
  repository: BuildRepositoryDto;
  phases: BuildPhaseDto[];
  metrics: BuildMetricsDto;
  isArchived: boolean;
  archivedAt?: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  projectId?: string;
  userId?: string;
  logsUrl?: string;
  errorMessage?: string;
}