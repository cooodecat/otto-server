import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { CodeBuildService } from './codebuild.service';
import { StartBuildDto } from './dto/start-build.dto';
import { BuildResponse, BuildStatusResponse } from './types/codebuild.types';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';

@Controller('codebuild')
@UseGuards(SupabaseAuthGuard)
export class CodeBuildController {
  private readonly logger = new Logger(CodeBuildController.name);

  constructor(private readonly codeBuildService: CodeBuildService) {}

  @Post('start')
  async startBuild(
    @Body() startBuildDto: StartBuildDto,
  ): Promise<BuildResponse> {
    try {
      this.logger.log(
        'Starting CodeBuild with input:',
        JSON.stringify(startBuildDto, null, 2),
      );

      const result = await this.codeBuildService.startBuildFromJson(
        startBuildDto,
        startBuildDto.environment_variables,
      );

      return result;
    } catch (error: any) {
      this.logger.error('Failed to start build:', error);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.name === 'ResourceNotFoundException') {
        throw new HttpException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `CodeBuild project not found: ${error.message}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.name === 'InvalidInputException') {
        throw new HttpException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `Invalid build configuration: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.name === 'UnauthorizedOperation') {
        throw new HttpException(
          'Insufficient permissions to start build',
          HttpStatus.FORBIDDEN,
        );
      }

      throw new HttpException(
        'Failed to start build',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:buildId')
  async getBuildStatus(
    @Param('buildId') buildId: string,
  ): Promise<BuildStatusResponse> {
    try {
      this.logger.log(`Getting build status for: ${buildId}`);

      const result = await this.codeBuildService.getBuildStatus(buildId);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to get build status for ${buildId}:`, error);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      if (error.message.includes('not found')) {
        throw new HttpException(
          `Build with ID ${buildId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        'Failed to get build status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('convert')
  convertJsonToYaml(@Body() startBuildDto: StartBuildDto): {
    buildspec: string;
  } {
    try {
      this.logger.log('Converting JSON to buildspec YAML');

      const buildspec =
        this.codeBuildService.convertJsonToBuildSpec(startBuildDto);

      return { buildspec };
    } catch (error) {
      this.logger.error('Failed to convert JSON to YAML:', error);

      throw new HttpException(
        'Failed to convert build configuration',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
