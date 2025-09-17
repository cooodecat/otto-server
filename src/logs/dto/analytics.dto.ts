import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum TimeRangeType {
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
}

export enum GroupByType {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Query parameters for analytics API
 */
export class GetAnalyticsDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(TimeRangeType)
  @Transform(
    ({ value }) => (value || TimeRangeType.SEVEN_DAYS) as TimeRangeType,
  )
  timeRange: TimeRangeType = TimeRangeType.SEVEN_DAYS;

  @IsOptional()
  @IsEnum(GroupByType)
  @Transform(({ value }) => (value || GroupByType.DAY) as GroupByType)
  groupBy: GroupByType = GroupByType.DAY;
}

/**
 * Analytics summary
 */
export interface AnalyticsSummaryDto {
  totalBuilds: number;
  successCount: number;
  failedCount: number;
  successRate: number; // percentage
  averageDuration: string; // formatted string
  totalLogLines: number;
  totalErrors: number;
  totalWarnings: number;
}

/**
 * Trend data point
 */
export interface TrendDataDto {
  timestamp: string;
  date: string;
  successCount: number;
  failedCount: number;
  averageDuration: number; // seconds
  totalBuilds: number;
}

/**
 * Error pattern analysis
 */
export interface ErrorPatternDto {
  pattern: string;
  count: number;
  percentage: number;
  lastOccurrence: string;
  affectedBuilds: string[];
  examples: string[];
}

/**
 * Phase-specific metrics
 */
export interface PhaseMetricsDto {
  phase: string;
  totalExecutions: number;
  averageDuration: string;
  successRate: number;
  failureRate: number;
  commonErrors: string[];
}

/**
 * Build duration distribution
 */
export interface DurationDistributionDto {
  range: string; // e.g., "0-1m", "1-5m", "5-10m", "10m+"
  count: number;
  percentage: number;
}

/**
 * Top performing/failing projects
 */
export interface ProjectPerformanceDto {
  projectId: string;
  projectName?: string;
  totalBuilds: number;
  successRate: number;
  averageDuration: string;
  lastBuildTime: string;
  trend: 'improving' | 'declining' | 'stable';
}

/**
 * Complete analytics response
 */
export interface BuildAnalyticsResponseDto {
  summary: AnalyticsSummaryDto;
  trends: TrendDataDto[];
  errorPatterns: ErrorPatternDto[];
  phaseMetrics: PhaseMetricsDto[];
  durationDistribution: DurationDistributionDto[];
  topProjects?: ProjectPerformanceDto[];
  timeRange: {
    start: string;
    end: string;
    type: TimeRangeType;
  };
  generatedAt: string;
}
