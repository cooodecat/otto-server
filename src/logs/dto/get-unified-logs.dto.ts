import { IsOptional, IsNumber, IsArray, IsString, IsBoolean, IsEnum, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  UNKNOWN = 'UNKNOWN',
}

export enum TimeRange {
  ONE_HOUR = '1h',
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  ALL = 'all',
}

/**
 * DTO for unified logs query parameters
 */
export class GetUnifiedLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 100;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim().toUpperCase());
    }
    return value;
  })
  @IsArray()
  @IsEnum(LogLevel, { each: true })
  levels?: LogLevel[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  regex?: boolean = false;

  @IsOptional()
  @IsEnum(TimeRange)
  timeRange?: TimeRange = TimeRange.ALL;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeContext?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contextLines?: number = 3;
}