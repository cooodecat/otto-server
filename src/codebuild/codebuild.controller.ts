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
import { BuildResponse, BuildStatusResponse } from './types/codebuild.types';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';
import type { FlowPipelineInput } from './types/flow-block.types';

/**
 * CodeBuild REST API 컨트롤러
 *
 * AWS CodeBuild를 사용한 멀티테넌트 CI/CD 빌드 시스템의 REST API를 제공합니다.
 * 각 사용자는 자신이 소유한 프로젝트에서만 빌드를 실행할 수 있으며,
 * FlowBlock 기반 파이프라인 설정을 AWS CodeBuild buildspec.yml로 자동 변환하여 실행합니다.
 *
 * @description
 * 이 컨트롤러는 다음과 같은 API 엔드포인트를 제공합니다:
 * - POST /:projectId/start-flow - FlowBlock 기반 파이프라인으로 빌드 시작
 * - GET /status/:buildId - 빌드 상태 조회
 * - POST /convert-flow - FlowBlock 파이프라인을 buildspec.yml로 변환 (미리보기)
 *
 * @security
 * 모든 엔드포인트는 SupabaseAuthGuard를 통한 JWT 인증이 필요하며,
 * 사용자는 자신이 소유한 프로젝트에서만 빌드를 실행할 수 있습니다.
 *
 * @see {@link CodeBuildService} - 핵심 빌드 로직
 * @see {@link FlowPipelineInput} - FlowBlock 기반 파이프라인 입력
 * @since 1.0.0
 */
@Controller('api/v1/codebuild')
@UseGuards(SupabaseAuthGuard)
export class CodeBuildController {
  private readonly logger = new Logger(CodeBuildController.name);

  /**
   * CodeBuildController 생성자
   *
   * @param codeBuildService - AWS CodeBuild 관리 서비스
   */
  constructor(private readonly codeBuildService: CodeBuildService) {}

  /**
   * 빌드 상태를 조회합니다
   *
   * AWS CodeBuild ID를 통해 현재 빌드 진행 상황과 결과를 확인할 수 있습니다.
   * 빌드 상태 조회와 동시에 최신 정보가 데이터베이스에 자동으로 업데이트됩니다.
   * 모든 인증된 사용자가 빌드 상태를 조회할 수 있습니다.
   *
   * @param buildId - 조회할 AWS CodeBuild 빌드 ID
   * @returns 빌드 상태 정보 (buildId, buildStatus, startTime, endTime, phases, logs)
   *
   * @throws {HttpException} 404 - 빌드를 찾을 수 없는 경우
   * @throws {HttpException} 500 - 서버 내부 오류
   *
   * @example
   * GET /api/v1/codebuild/status/otto-user123-myapp:12345678-1234-1234-1234-123456789012
   * Authorization: Bearer JWT_TOKEN
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
   * FlowBlock 기반 파이프라인으로 빌드를 시작합니다
   *
   * 사용자가 소유한 프로젝트에서만 빌드를 실행할 수 있습니다.
   * FlowBlock 배열을 받아서 AWS CodeBuild buildspec.yml로 변환하여 실행하며,
   * 빌드 시작과 동시에 실행 이력이 데이터베이스에 자동으로 저장됩니다.
   *
   * @param req - 인증된 사용자 요청 객체 (JWT 토큰에서 사용자 정보 추출)
   * @param projectId - 빌드를 실행할 프로젝트 ID
   * @param flowPipelineInput - FlowBlock 기반 파이프라인 설정
   * @returns 빌드 시작 결과 (buildId, buildStatus, projectName, startTime)
   *
   * @throws {HttpException} 404 - 프로젝트를 찾을 수 없거나 접근 권한이 없는 경우
   * @throws {HttpException} 400 - 잘못된 빌드 설정인 경우
   * @throws {HttpException} 403 - AWS 권한이 부족한 경우
   * @throws {HttpException} 500 - 서버 내부 오류
   *
   * @example
   * POST /api/v1/codebuild/proj_1234567890_abc123def/start-flow
   * Authorization: Bearer JWT_TOKEN
   * Content-Type: application/json
   *
   * Request Body:
   * {
   *   "version": "0.2",
   *   "runtime": "node:18",
   *   "blocks": [
   *     {
   *       "id": "install-deps",
   *       "block_type": "node_package_manager",
   *       "group_type": "build",
   *       "on_success": "build-app",
   *       "package_manager": "npm",
   *       "package_list": []
   *     },
   *     {
   *       "id": "build-app",
   *       "block_type": "custom_build_command",
   *       "group_type": "build",
   *       "on_success": "test-app",
   *       "custom_command": ["npm run build"]
   *     },
   *     {
   *       "id": "test-app",
   *       "block_type": "node_test_command",
   *       "group_type": "test",
   *       "on_success": "deploy-app",
   *       "package_manager": "npm",
   *       "test_command": ["npm test"]
   *     }
   *   ],
   *   "artifacts": ["dist/**"],
   *   "environment_variables": {
   *     "NODE_ENV": "production"
   *   }
   * }
   */
  @Post(':projectId/start-flow')
  async startFlowBuild(
    @Request() req,
    @Param('projectId') projectId: string,
    @Body() flowPipelineInput: FlowPipelineInput,
  ): Promise<BuildResponse> {
    try {
      // JWT 토큰에서 사용자 ID 추출
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const userId = req.user.sub;

      this.logger.log(
        `Starting FlowBlock build for project ${projectId} (user: ${userId}) with input:`,
        JSON.stringify(flowPipelineInput, null, 2),
      );

      // FlowBlock 기반 파이프라인으로 빌드 시작
      const result = await this.codeBuildService.startFlowBuild(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        userId,
        projectId,
        flowPipelineInput,
        flowPipelineInput.environment_variables,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to start FlowBlock build for project ${projectId}:`,
        error,
      );

      // AWS CodeBuild 프로젝트를 찾을 수 없는 경우
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.name === 'ResourceNotFoundException') {
        throw new HttpException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `CodeBuild project not found: ${error.message}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // 프로젝트 접근 권한이 없는 경우
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
        'Failed to start FlowBlock build',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FlowBlock 파이프라인을 buildspec.yml로 변환합니다
   *
   * 실제 빌드를 실행하지 않고 변환된 buildspec.yml 내용만 미리 확인할 수 있습니다.
   * 빌드 설정을 테스트하거나 디버깅할 때 유용하며, 인증은 필요하지만 프로젝트 소유권 확인은 하지 않습니다.
   *
   * @param flowPipelineInput - 변환할 FlowBlock 기반 파이프라인 설정
   * @returns 변환된 buildspec.yml 문자열
   *
   * @throws {HttpException} 400 - 잘못된 빌드 설정으로 변환에 실패한 경우
   *
   * @example
   * POST /api/v1/codebuild/convert-flow
   * Authorization: Bearer JWT_TOKEN
   * Content-Type: application/json
   *
   * Request Body:
   * {
   *   "version": "0.2",
   *   "runtime": "node:18",
   *   "blocks": [
   *     {
   *       "id": "install-deps",
   *       "block_type": "node_package_manager",
   *       "group_type": "build",
   *       "on_success": "build-app",
   *       "package_manager": "npm",
   *       "package_list": []
   *     }
   *   ]
   * }
   */
  @Post('convert-flow')
  convertFlowPipelineToYaml(@Body() flowPipelineInput: FlowPipelineInput): {
    buildspec: string;
  } {
    try {
      this.logger.log('Converting FlowBlock pipeline to buildspec YAML');

      const buildspec =
        this.codeBuildService.convertFlowPipelineToBuildSpec(flowPipelineInput);

      return { buildspec };
    } catch (error) {
      this.logger.error('Failed to convert FlowBlock pipeline to YAML:', error);

      throw new HttpException(
        'Failed to convert FlowBlock pipeline configuration',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
