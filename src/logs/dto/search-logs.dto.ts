import { IsString, IsBoolean, IsArray, IsOptional, IsNumber, Min, ValidateNested, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LogLevel } from './get-unified-logs.dto';

class TimeRangeDto {
  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;
}

/**
 * DTO for log search request
 */
export class SearchLogsDto {
  @IsString()
  query!: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  regex?: boolean = false;

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
  @ValidateNested()
  @Type(() => TimeRangeDto)
  timeRange?: TimeRangeDto;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeContext?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contextLines?: number = 3;

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
}

/**
 * Search result with context
 */
export interface SearchResult {
  lineNumber: number;
  timestamp: number;
  level?: string;
  message: string;
  matches?: Array<{
    start: number;
    end: number;
  }>;
  context?: {
    before: Array<{
      lineNumber: number;
      message: string;
    }>;
    after: Array<{
      lineNumber: number;
      message: string;
    }>;
  };
}

export interface SearchLogsResponse {
  results: SearchResult[];
  totalMatches: number;
  searchTime: number; // ms
  query: string;
  regex: boolean;
}