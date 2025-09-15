import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';
import { BuildsService } from './builds.service';
import type {
  Build,
  BuildPhase,
  BuildStats,
  BuildStatus,
} from './types/build.types';

/**
 * 인증된 사용자 정보 인터페이스
 */
interface AuthenticatedUser {
  sub: string; // 사용자 ID
  email?: string;
  [key: string]: any;
}

/**
 * 인증된 요청 인터페이스
 */
interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

/**
 * 빌드 이력 관리 REST API 컨트롤러
 *
 * 사용자의 CodeBuild 실행 이력을 조회하고 통계를 제공합니다.
 * 모든 엔드포인트는 JWT 인증을 요구하며, 사용자는 자신의 빌드 이력만 조회할 수 있습니다.
 *
 * @swagger
 * @tags Builds
 */
@Controller('api/v1/builds')
@UseGuards(SupabaseAuthGuard)
export class BuildsController {
  /**
   * BuildsController 생성자
   *
   * @param buildsService - 빌드 이력 관리 서비스
   */
  constructor(private readonly buildsService: BuildsService) {}

  /**
   * 현재 사용자의 모든 빌드 이력을 조회합니다
   *
   * 페이지네이션과 필터링을 지원하며, 최신 빌드부터 반환합니다.
   *
   * @param req - 인증된 사용자 요청 객체
   * @param limit - 페이지당 항목 수 (기본값: 20)
   * @param offset - 시작 위치 (기본값: 0)
   * @param projectId - 특정 프로젝트만 필터링
   * @param status - 특정 상태만 필터링
   * @returns 사용자의 빌드 이력 목록
   *
   * @example
   * GET /api/v1/builds?limit=10&offset=0&projectId=proj_123&status=succeeded
   */
  @Get()
  async getUserBuilds(
    @Request() req: AuthenticatedRequest,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('projectId') projectId?: string,
    @Query('status') status?: BuildStatus,
  ): Promise<Build[]> {
    const userId = req.user.sub;

    return this.buildsService.getUserBuilds_Legacy(userId, {
      limit: Math.min(limit, 100), // 최대 100개로 제한
      offset,
      projectId,
      status,
    });
  }

  /**
   * 특정 프로젝트의 빌드 이력을 조회합니다
   *
   * 프로젝트 소유자만 해당 프로젝트의 빌드 이력을 조회할 수 있습니다.
   *
   * @param req - 인증된 사용자 요청 객체
   * @param projectId - 프로젝트 ID
   * @param limit - 페이지당 항목 수 (기본값: 20)
   * @param offset - 시작 위치 (기본값: 0)
   * @param status - 특정 상태만 필터링
   * @returns 프로젝트의 빌드 이력 목록
   *
   * @example
   * GET /api/v1/builds/projects/proj_1234567890_abc123def?limit=10&status=failed
   */
  @Get('projects/:projectId')
  async getProjectBuilds(
    @Request() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('status') status?: BuildStatus,
  ): Promise<Build[]> {
    const userId = req.user.sub;

    return this.buildsService.getUserBuilds_Legacy(userId, {
      limit: Math.min(limit, 100),
      offset,
      projectId,
      status,
    });
  }

  /**
   * 특정 빌드의 상세 정보를 조회합니다
   *
   * 빌드 소유자만 해당 빌드의 상세 정보를 조회할 수 있습니다.
   *
   * @param req - 인증된 사용자 요청 객체
   * @param buildId - 빌드 ID
   * @returns 빌드 상세 정보
   *
   * @example
   * GET /api/v1/builds/build_1640995200000_abc123def
   */
  @Get(':buildId')
  async getBuildDetails(
    @Request() req: AuthenticatedRequest,
    @Param('buildId') buildId: string,
  ): Promise<Build> {
    const userId = req.user.sub;
    return this.buildsService.getBuildDetails_Legacy(userId, buildId);
  }

  /**
   * 특정 빌드의 단계별 상세 정보를 조회합니다
   *
   * 빌드의 각 단계(install, build, test 등)별 실행 결과와 소요 시간을 확인할 수 있습니다.
   *
   * @param req - 인증된 사용자 요청 객체
   * @param buildId - 빌드 ID
   * @returns 빌드 단계별 정보 목록
   *
   * @example
   * GET /api/v1/builds/build_1640995200000_abc123def/phases
   */
  @Get(':buildId/phases')
  async getBuildPhases(
    @Request() req: AuthenticatedRequest,
    @Param('buildId') buildId: string,
  ): Promise<BuildPhase[]> {
    const userId = req.user.sub;
    return this.buildsService.getBuildPhases_Legacy(userId, buildId);
  }

  /**
   * 사용자의 전체 빌드 통계를 조회합니다
   *
   * 총 빌드 수, 성공률, 평균 빌드 시간 등의 통계 정보를 제공합니다.
   *
   * @param req - 인증된 사용자 요청 객체
   * @param projectId - 특정 프로젝트만 통계 산출
   * @returns 빌드 통계 정보
   *
   * @example
   * GET /api/v1/builds/stats
   * GET /api/v1/builds/stats?projectId=proj_123
   */
  @Get('stats/summary')
  async getBuildStats(
    @Request() req: AuthenticatedRequest,
    @Query('projectId') projectId?: string,
  ): Promise<BuildStats> {
    const userId = req.user.sub;
    return this.buildsService.getBuildStats_Legacy(userId, projectId);
  }
}
