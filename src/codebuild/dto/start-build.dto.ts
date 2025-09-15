import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BuildCommandsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  install?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pre_build?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  build?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  post_build?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  finally?: string[];
}

export class BuildCacheDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];
}

export class BuildReportDto {
  @IsArray()
  @IsString({ each: true })
  files!: string[];

  @IsOptional()
  @IsString()
  'file-format'?:
    | 'JUNITXML'
    | 'CUCUMBERJSON'
    | 'TESTNGXML'
    | 'CLOVERXML'
    | 'VISUALSTUDIOTRX'
    | 'JACOCOXML'
    | 'NUNITXML'
    | 'NUNIT3XML';

  @IsOptional()
  @IsString()
  'base-directory'?: string;

  @IsOptional()
  discard_paths?: boolean;
}


export class StartBuildDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  runtime?: string;

  @ValidateNested()
  @Type(() => BuildCommandsDto)
  commands!: BuildCommandsDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artifacts?: string[];

  @IsOptional()
  @IsObject()
  environment_variables?: Record<string, string>;

  @IsOptional()
  @ValidateNested()
  @Type(() => BuildCacheDto)
  cache?: BuildCacheDto;

  @IsOptional()
  @IsObject()
  reports?: Record<string, BuildReportDto>;

  @IsOptional()
  @IsString()
  on_failure?: 'ABORT' | 'CONTINUE';

  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;

}
