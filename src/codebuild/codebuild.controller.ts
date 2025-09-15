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
  Request,
} from '@nestjs/common';
import { CodeBuildService } from './codebuild.service';
import { StartBuildDto } from './dto/start-build.dto';
import { BuildResponse, BuildStatusResponse } from './types/codebuild.types';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';

/**
 * 멀티테넌트 CI/CD 빌드 REST API 컨트롤러
 *
 * 사용자가 선택한 프로젝트에서 CodeBuild를 실행합니다.
 * 각 사용자는 자신이 소유한 프로젝트에서만 빌드를 실행할 수 있습니다.
 *
 * @swagger
 * @tags CodeBuild
 */
@Controller('api/v1/codebuild')
@UseGuards(SupabaseAuthGuard)
export class CodeBuildController {
  private readonly logger = new Logger(CodeBuildController.name);

  /**
   * CodeBuildController 생성자
   *
   * @param codeBuildService - CodeBuild 관리 서비스
   */
  constructor(private readonly codeBuildService: CodeBuildService) {}

  /**
   * 특정 프로젝트에서 빌드를 시작합니다
   *
   * 사용자가 소유한 프로젝트에서만 빌드를 실행할 수 있습니다.
   * JSON 형태의 빌드 설정을 받아 AWS CodeBuild buildspec.yml로 변환하여 실행합니다.
   *
   * @param req - 인증된 사용자 요청 객체
   * @param projectId - 빌드를 실행할 프로젝트 ID
   * @param startBuildDto - 빌드 설정 정보
   * @returns 빌드 시작 결과
   *
   * @example
   * POST /api/v1/codebuild/proj_1234567890_abc123def/start
   * {
   *   "runtime": "node:18",
   *   "commands": {
   *     "install": ["npm ci"],
   *     "build": ["npm run build"]
   *   },
   *   "artifacts": ["dist/**/*"]
   * }
   */
  @Post(':projectId/start')
  async startBuild(
    @Request() req,
    @Param('projectId') projectId: string,
    @Body() startBuildDto: StartBuildDto,
  ): Promise<BuildResponse> {
    try {
      const userId = req.user.sub;

      this.logger.log(
        `Starting CodeBuild for project ${projectId} (user: ${userId}) with input:`,
        JSON.stringify(startBuildDto, null, 2),
      );

      // 사용자의 특정 프로젝트에서 빌드 시작
      const result = await this.codeBuildService.startBuildFromJson(
        userId,
        projectId,
        startBuildDto,
        startBuildDto.environment_variables,
      );

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to start build for project ${projectId}:`, error);

      // AWS CodeBuild 프로젝트를 찾을 수 없는 경우
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.name === 'ResourceNotFoundException') {
        throw new HttpException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `CodeBuild project not found: ${error.message}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // 프로젝트 접근 권한이 없는 경우 (ProjectsService에서 던지는 NotFoundException)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.status === HttpStatus.NOT_FOUND) {
        throw new HttpException(
          `Project not found or access denied: ${projectId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // 잘못된 빌드 설정인 경우
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.name === 'InvalidInputException') {
        throw new HttpException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `Invalid build configuration: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // AWS 권한 부족인 경우
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

  /**
   * 빌드 상태를 조회합니다
   *
   * 빌드 ID를 통해 현재 빌드 진행 상황과 결과를 확인할 수 있습니다.
   * 모든 인증된 사용자가 빌드 상태를 조회할 수 있습니다.
   *
   * @param buildId - 조회할 빌드 ID
   * @returns 빌드 상태 정보
   *
   * @example
   * GET /api/v1/codebuild/status/otto-user123-myapp:12345678-1234-1234-1234-123456789012
   */
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

      // 빌드를 찾을 수 없는 경우
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

  /**
   * JSON 빌드 설정을 buildspec.yml로 변환합니다
   *
   * 실제 빌드를 실행하지 않고 변환된 buildspec.yml 내용만 미리 확인할 수 있습니다.
   * 빌드 설정을 테스트하거나 디버깅할 때 유용합니다.
   *
   * @param startBuildDto - 변환할 JSON 빌드 설정
   * @returns 변환된 buildspec.yml 문자열
   *
   * @example
   * POST /api/v1/codebuild/convert
   * {
   *   "runtime": "node:18",
   *   "commands": {
   *     "build": ["npm run build"]
   *   }
   * }
   */
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