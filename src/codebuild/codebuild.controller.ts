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
import type { SimplePipelineInput } from './types/pipeline-input.types';

/**
 * CodeBuild REST API 컨트롤러
 *
 * @description
 * AWS CodeBuild를 사용한 멀티테넌트 CI/CD 빌드 시스템의 REST API를 제공합니다.
 * 각 사용자는 자신이 소유한 프로젝트에서만 빌드를 실행할 수 있으며,
 * 블록 기반 파이프라인 설정을 AWS CodeBuild buildspec.yml로 자동 변환하여 실행합니다.
 *
 * ## 주요 기능
 * - 블록 기반 비주얼 파이프라인 빌드 실행
 * - 실시간 빌드 상태 모니터링
 * - buildspec.yml 미리보기 및 변환
 * - 멀티테넌트 프로젝트 격리
 *
 * ## API 엔드포인트
 * - `POST /:projectId/start-flow` - 블록 기반 파이프라인으로 빌드 시작
 * - `GET /status/:buildId` - 빌드 상태 조회
 * - `POST /convert-flow` - 블록 파이프라인을 buildspec.yml로 변환 (미리보기)
 *
 * ## 보안
 * 모든 엔드포인트는 SupabaseAuthGuard를 통한 JWT 인증이 필요하며,
 * 사용자는 자신이 소유한 프로젝트에서만 빌드를 실행할 수 있습니다.
 *
 * @class CodeBuildController
 * @decorator `@Controller('codebuild')`
 * @decorator `@UseGuards(SupabaseAuthGuard)`
 *
 * @see {@link CodeBuildService} - 핵심 빌드 로직
 * @see {@link SimplePipelineInput} - 블록 기반 파이프라인 입력
 * @see {@link BuildResponse} - 빌드 응답 타입
 * @see {@link BuildStatusResponse} - 빌드 상태 응답 타입
 *
 * @since 1.0.0
 * @author Otto Team
 */
@Controller('codebuild')
@UseGuards(SupabaseAuthGuard)
export class CodeBuildController {
  /**
   * 로거 인스턴스
   * @private
   * @readonly
   */
  private readonly logger = new Logger(CodeBuildController.name);

  /**
   * CodeBuildController 생성자
   *
   * @constructor
   * @param {CodeBuildService} codeBuildService - AWS CodeBuild 관리 서비스
   */
  constructor(private readonly codeBuildService: CodeBuildService) {}

  /**
   * 빌드 상태를 조회합니다
   *
   * @description
   * AWS CodeBuild ID를 통해 현재 빌드 진행 상황과 결과를 확인할 수 있습니다.
   * 빌드 상태 조회와 동시에 최신 정보가 데이터베이스에 자동으로 업데이트됩니다.
   * 모든 인증된 사용자가 빌드 상태를 조회할 수 있습니다.
   *
   * ## 빌드 상태 값
   * - `SUCCEEDED` - 빌드 성공
   * - `FAILED` - 빌드 실패
   * - `IN_PROGRESS` - 빌드 진행 중
   * - `STOPPED` - 빌드 중단됨
   * - `TIMED_OUT` - 빌드 타임아웃
   *
   * @method getBuildStatus
   * @async
   * @param {string} buildId - 조회할 AWS CodeBuild 빌드 ID
   * @returns {Promise<BuildStatusResponse>} 빌드 상태 정보 (buildId, buildStatus, startTime, endTime, phases, logs)
   *
   * @throws {HttpException} 404 - 빌드를 찾을 수 없는 경우
   * @throws {HttpException} 500 - 서버 내부 오류
   *
   * @example
   * ```bash
   * GET /api/v1/codebuild/status/otto-user123-myapp:12345678-1234-1234-1234-123456789012
   * Authorization: Bearer JWT_TOKEN
   *
   * # Response
   * {
   *   "buildId": "otto-user123-myapp:12345678-1234-1234-1234-123456789012",
   *   "buildStatus": "IN_PROGRESS",
   *   "codebuildProjectName": "otto-user123-myapp",
   *   "startTime": "2024-01-01T00:00:00Z",
   *   "currentPhase": "BUILD",
   *   "phases": [...],
   *   "logs": { "deepLink": "..." }
   * }
   * ```
   */
  @Get('status/:buildId')
  async getBuildStatus(
    @Param('buildId') buildId: string,
  ): Promise<BuildStatusResponse> {
    try {
      // 빌드 ID 로깅
      this.logger.log(`Getting build status for: ${buildId}`);

      // CodeBuild 서비스를 통해 빌드 상태 조회
      const result = await this.codeBuildService.getBuildStatus(buildId);

      return result;
    } catch (error: unknown) {
      // 오류 로깅
      this.logger.error(`Failed to get build status for ${buildId}:`, error);

      // 빌드를 찾을 수 없는 경우 404 반환
      if (error instanceof Error && error.message.includes('not found')) {
        throw new HttpException(
          `Build with ID ${buildId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      // 기타 오류는 500 반환
      throw new HttpException(
        'Failed to get build status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 블록 기반 파이프라인으로 빌드를 시작합니다
   *
   * @description
   * 사용자가 소유한 프로젝트에서만 빌드를 실행할 수 있습니다.
   * 블록 배열을 받아서 AWS CodeBuild buildspec.yml로 변환하여 실행하며,
   * 빌드 시작과 동시에 실행 이력이 데이터베이스에 자동으로 저장됩니다.
   * 버전, 런타임, 환경변수 등의 설정은 블록 내부에서 추출합니다.
   *
   * ## 빌드 프로세스
   * 1. JWT 토큰에서 사용자 ID 추출
   * 2. 블록 배열에서 설정 정보 추출 (version, runtime, environment variables)
   * 3. 블록 파이프라인을 buildspec.yml로 변환
   * 4. AWS CodeBuild 프로젝트에서 빌드 시작
   * 5. 빌드 이력을 데이터베이스에 저장
   * 6. 빌드 ID 및 상태 반환
   *
   * ## CodeBuild 프로젝트명 규칙
   * AWS CodeBuild 프로젝트명은 `otto-{userId}-{projectId}` 형식으로 자동 생성됩니다.
   *
   * @method startFlowBuild
   * @async
   * @param {Request} req - 인증된 사용자 요청 객체 (JWT 토큰에서 사용자 정보 추출)
   * @param {string} projectId - 빌드를 실행할 프로젝트 ID
   * @param {SimplePipelineInput} pipelineInput - 블록 기반 파이프라인 설정 (blocks 배열만 포함)
   * @returns {Promise<BuildResponse>} 빌드 시작 결과 (buildId, buildStatus, codebuildProjectName, startTime)
   *
   * @throws {HttpException} 404 - 프로젝트를 찾을 수 없거나 접근 권한이 없는 경우
   * @throws {HttpException} 400 - 잘못된 빌드 설정인 경우
   * @throws {HttpException} 403 - AWS 권한이 부족한 경우
   * @throws {HttpException} 500 - 서버 내부 오류
   *
   * @example
   * ```bash
   * POST /api/v1/codebuild/proj_1234567890_abc123def/start-flow
   * Authorization: Bearer JWT_TOKEN
   * Content-Type: application/json
   *
   * # Request Body
   * {
   *   "blocks": [
   *     {
   *       "id": "install-deps",
   *       "blockType": "nodePackageManager",
   *       "groupType": "build",
   *       "onSuccess": "build-app",
   *       "packageManager": "npm",
   *       "packageList": []
   *     },
   *     {
   *       "id": "build-app",
   *       "blockType": "customBuildCommand",
   *       "groupType": "build",
   *       "onSuccess": "test-app",
   *       "onFailed": "notify-failure",
   *       "customCommand": ["npm run build"]
   *     },
   *     {
   *       "id": "test-app",
   *       "blockType": "nodeTestCommand",
   *       "groupType": "test",
   *       "packageManager": "npm",
   *       "testCommand": ["npm test"]
   *     },
   *     {
   *       "id": "notify-failure",
   *       "blockType": "customRunCommand",
   *       "groupType": "run",
   *       "customCommand": ["echo 'Build failed!' | mail -s 'Build Failure' team@example.com"]
   *     }
   *   ]
   * }
   *
   * # Response
   * {
   *   "buildId": "otto-user123-proj_1234567890_abc123def:build-id-123",
   *   "buildStatus": "IN_PROGRESS",
   *   "codebuildProjectName": "otto-user123-proj_1234567890_abc123def",
   *   "startTime": "2024-01-01T00:00:00Z"
   * }
   * ```
   */
  @Post(':projectId/start-flow')
  async startFlowBuild(
    @Request() req,
    @Param('projectId') projectId: string,
    @Body() pipelineInput: SimplePipelineInput,
  ): Promise<BuildResponse> {
    try {
      // JWT 토큰에서 사용자 ID 추출 (Supabase JWT의 sub 클레임)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const userId = req.user.sub;

      // 빌드 시작 로그 (디버깅용)
      this.logger.log(
        `Starting pipeline build for project ${projectId} (user: ${userId}) with input:`,
        JSON.stringify(pipelineInput, null, 2),
      );

      // camelCase 파이프라인으로 빌드 시작
      const result = await this.codeBuildService.startPipelineBuild(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        userId,
        projectId,
        pipelineInput,
      );

      return result;
    } catch (error: unknown) {
      // 오류 로깅
      this.logger.error(
        `Failed to start FlowBlock build for project ${projectId}:`,
        error,
      );

      // AWS CodeBuild 프로젝트를 찾을 수 없는 경우
      if (
        error instanceof Error &&
        error.name === 'ResourceNotFoundException'
      ) {
        throw new HttpException(
          `CodeBuild project not found for build: ${error.message}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // 프로젝트 접근 권한이 없는 경우
      if (error instanceof HttpException && error.getStatus() === 404) {
        throw new HttpException(
          `Project not found or access denied: ${projectId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // 잘못된 빌드 설정인 경우
      if (error instanceof Error && error.name === 'InvalidInputException') {
        throw new HttpException(
          `Invalid build configuration: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // AWS 권한 부족인 경우
      if (error instanceof Error && error.name === 'UnauthorizedOperation') {
        throw new HttpException(
          'Insufficient permissions to start build',
          HttpStatus.FORBIDDEN,
        );
      }

      // 기타 오류는 500 반환
      throw new HttpException(
        'Failed to start FlowBlock build',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * FlowBlock 파이프라인을 buildspec.yml로 변환합니다
   *
   * @description
   * 실제 빌드를 실행하지 않고 변환된 buildspec.yml 내용만 미리 확인할 수 있습니다.
   * 빌드 설정을 테스트하거나 디버깅할 때 유용하며, 인증은 필요하지만 프로젝트 소유권 확인은 하지 않습니다.
   *
   * ## 사용 사례
   * - 빌드 설정 미리보기
   * - buildspec.yml 구조 학습
   * - 파이프라인 디버깅
   * - CI/CD 설정 검증
   *
   * ## 변환 프로세스
   * 1. 블록 배열을 받아서 그룹별로 분류
   * 2. 블록 내부에서 설정 정보 추출 (version, runtime, environment variables)
   * 3. 각 그룹을 AWS CodeBuild 단계로 매핑
   *    - CUSTOM → pre_build
   *    - BUILD → build
   *    - TEST → post_build (초반부)
   *    - RUN → post_build (후반부)
   * 4. 조건부 플로우(onSuccess/onFailed)를 bash if/then/else로 변환
   * 5. YAML 형식으로 출력
   *
   * @method convertPipelineToYaml
   * @param {SimplePipelineInput} pipelineInput - 변환할 블록 기반 파이프라인 설정 (blocks 배열만 포함)
   * @returns {{ buildspec: string }} 변환된 buildspec.yml 문자열을 포함한 객체
   *
   * @throws {HttpException} 400 - 잘못된 빌드 설정으로 변환에 실패한 경우
   *
   * @example
   * ```bash
   * POST /api/v1/codebuild/convert-flow
   * Authorization: Bearer JWT_TOKEN
   * Content-Type: application/json
   *
   * # Request Body
   * {
   *   "blocks": [
   *     {
   *       "id": "install-deps",
   *       "blockType": "nodePackageManager",
   *       "groupType": "build",
   *       "onSuccess": "build-app",
   *       "packageManager": "npm",
   *       "packageList": []
   *     },
   *     {
   *       "id": "build-app",
   *       "blockType": "customBuildCommand",
   *       "groupType": "build",
   *       "customCommand": ["npm run build"]
   *     }
   *   ]
   * }
   *
   * # Response
   * {
   *   "buildspec": "version: 0.2\nphases:\n  install:\n    runtime-versions:\n      node: 18\n  build:\n    commands:\n      - '# Block: install-deps'\n      - npm install\n      - '# Block: build-app'\n      - npm run build\n    on-failure: ABORT\nartifacts:\n  files:\n    - dist/**\n"
   * }
   * ```
   */
  @Post('convert-flow')
  convertPipelineToYaml(@Body() pipelineInput: SimplePipelineInput): {
    buildspec: string;
  } {
    try {
      // 변환 시작 로그
      this.logger.log('Converting pipeline to buildspec YAML');

      // 파이프라인을 buildspec.yml로 변환
      const buildspec =
        this.codeBuildService.convertPipelineInputToBuildSpec(pipelineInput);

      // 변환된 buildspec 반환
      return { buildspec };
    } catch (error) {
      // 오류 로깅
      this.logger.error('Failed to convert pipeline to YAML:', error);

      // 변환 실패 시 400 반환
      throw new HttpException(
        'Failed to convert pipeline configuration',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
