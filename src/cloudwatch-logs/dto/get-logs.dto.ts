import {
  IsDateString,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class GetLogsDto {
  @IsString()
  codebuildId!: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  limit?: number = 1000;

  @IsOptional()
  @IsString()
  nextToken?: string;
}
