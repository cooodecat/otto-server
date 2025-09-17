import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LogsService } from '../logs/logs.service';
import {
  BuildHistory,
  BuildExecutionPhase,
  CreateBuildHistoryRequest,
  UpdateBuildHistoryRequest,
  BuildHistoryQueryOptions,
  BuildHistoryStats,
  PhaseType,
  PhaseStatus,
  // 레거시 타입들 (하위 호환성)
  Build,
  BuildPhase,
  CreateBuildRequest,
  UpdateBuildRequest,
  BuildQueryOptions,
  BuildStats,
} from './types/build.types';
import type { BuildPhase as AWSBuildPhase } from '@aws-sdk/client-codebuild';

/**
 * CodeBuild 빌드 실행 이력 관리 서비스
 *
 * 빌드 실행 이력을 Supabase 데이터베이스에 저장하고 관리합니다.
 * 사용자별, 프로젝트별 빌드 이력 조회와 통계 기능을 제공합니다.
 * 팀원의 프로젝트 테이블과 연동되어 동작합니다.
 *
 * @example
 * ```typescript
 * // 빌드 시작 시 이력 저장
 * const buildHistory = await buildsService.saveBuildStart({
 *   userId: 'user-uuid',
 *   projectId: 'project-uuid',
 *   awsBuildId: 'build-789',
 *   buildSpec: buildConfig
 * });
 *
 * // 빌드 상태 업데이트
 * await buildsService.updateBuildStatus('aws-build-id', {
 *   buildExecutionStatus: 'succeeded',
 *   endTime: new Date()
 * });
 * ```
 */
@Injectable()
export class BuildsService {
  private readonly logger = new Logger(BuildsService.name);

  /**
   * BuildsService 생성자
   *
   * @param supabaseService - Supabase 데이터베이스 서비스
   * @param logsService - 로그 아카이빙 서비스
   */
  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => LogsService))
    private readonly logsService: LogsService,
  ) {}

  /**
   * 빌드 시작 시 초기 이력을 저장합니다
   *
   * @param request - 빌드 생성 요청 정보
   * @returns 생성된 빌드 이력
   * @throws {Error} 빌드 이력 저장에 실패한 경우
   */
  async saveBuildStart(
    request: CreateBuildHistoryRequest,
  ): Promise<BuildHistory> {
    try {
      const buildData = {
        user_id: request.userId,
        project_id: request.projectId,
        aws_build_id: request.awsBuildId,
        build_execution_status: 'in_progress' as const,
        build_spec: request.buildSpec,
        environment_variables: request.environmentVariables || null,
        start_time:
          request.startTime?.toISOString() || new Date().toISOString(),
        end_time: null,
        duration_seconds: null,
        logs_url: null,
        build_error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data, error } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .insert(buildData)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to save build start: ${error.message}`);
        throw error;
      }

      this.logger.log(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Build history saved: ${data.id} for AWS build ${request.awsBuildId}`,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return this.mapDatabaseRowToBuildHistory(data);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.logger.error(`Failed to save build start: ${error}`);
      throw error;
    }
  }

  /**
   * 빌드 상태를 업데이트합니다
   *
   * @param awsBuildId - AWS CodeBuild ID
   * @param updateData - 업데이트할 빌드 정보
   * @returns 업데이트된 빌드 이력
   * @throws {NotFoundException} 빌드를 찾을 수 없는 경우
   */
  async updateBuildStatus(
    awsBuildId: string,
    updateData: UpdateBuildHistoryRequest,
  ): Promise<BuildHistory> {
    try {
      const updatePayload: any = {
        updated_at: new Date().toISOString(),
      };

      // 업데이트 데이터 매핑
      if (updateData.buildExecutionStatus) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        updatePayload.build_execution_status = updateData.buildExecutionStatus;
      }
      if (updateData.endTime) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        updatePayload.end_time = updateData.endTime.toISOString();
      }
      if (updateData.durationSeconds !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        updatePayload.duration_seconds = updateData.durationSeconds;
      }
      if (updateData.logsUrl) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        updatePayload.logs_url = updateData.logsUrl;
      }
      if (updateData.buildErrorMessage) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        updatePayload.build_error_message = updateData.buildErrorMessage;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data, error } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .update(updatePayload)
        .eq('aws_build_id', awsBuildId)
        .select()
        .single();

      if (error || !data) {
        this.logger.error(`Build not found for AWS build ID: ${awsBuildId}`);
        throw new NotFoundException(`Build not found: ${awsBuildId}`);
      }

      this.logger.log(
        `Build status updated: ${awsBuildId} -> ${updateData.buildExecutionStatus}`,
      );

      // 빌드가 완료 상태로 변경되면 로그 아카이빙 트리거
      if (updateData.buildExecutionStatus) {
        const isTerminalStatus = [
          'succeeded',
          'failed',
          'stopped',
          'timed_out',
        ].includes(updateData.buildExecutionStatus.toLowerCase());

        if (isTerminalStatus) {
          this.logger.log(
            `Build ${awsBuildId} reached terminal status: ${updateData.buildExecutionStatus}. Triggering log archiving.`,
          );

          // 비동기로 로그 아카이빙 실행 (빌드 업데이트 응답을 지연시키지 않음)
          void this.logsService
            .handleBuildComplete(awsBuildId)
            .catch((error) => {
              this.logger.error(
                `Failed to archive logs for build ${awsBuildId}:`,
                error,
              );
            });
        }
      }

      return this.mapDatabaseRowToBuildHistory(data);
    } catch (error) {
      this.logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Failed to update build status for ${awsBuildId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * 빌드 실행 단계별 정보를 저장합니다
   *
   * @param awsBuildId - AWS CodeBuild ID
   * @param phases - AWS CodeBuild 단계 정보
   */
  async saveBuildPhases(
    awsBuildId: string,
    phases: AWSBuildPhase[],
  ): Promise<void> {
    try {
      // 먼저 빌드 ID 조회
      const { data: buildData, error: buildError } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .select('id')
        .eq('aws_build_id', awsBuildId)
        .single();

      if (buildError || !buildData) {
        this.logger.error(`Build not found for AWS build ID: ${awsBuildId}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const buildHistoryId = buildData.id;

      // 기존 단계 정보 삭제 (업데이트를 위해)
      await this.supabaseService
        .getClient()
        .from('build_execution_phases')
        .delete()
        .eq('build_history_id', buildHistoryId);

      // 새로운 단계 정보 저장
      const phaseData = phases.map((phase) => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        build_history_id: buildHistoryId,
        phase_type: phase.phaseType || 'UNKNOWN',
        phase_status: phase.phaseStatus || 'UNKNOWN',
        phase_start_time: phase.startTime?.toISOString() || null,
        phase_end_time: phase.endTime?.toISOString() || null,
        phase_duration_seconds: this.calculateDuration(
          phase.startTime,
          phase.endTime,
        ),
        phase_context_message: Array.isArray(phase.contexts)
          ? phase.contexts.map((c) => c.message).join('; ')
          : null,
        created_at: new Date().toISOString(),
      }));

      if (phaseData.length > 0) {
        const { error } = await this.supabaseService
          .getClient()
          .from('build_execution_phases')
          .insert(phaseData);

        if (error) {
          this.logger.error(`Failed to save build phases: ${error.message}`);
          throw error;
        }

        this.logger.log(
          `Saved ${phaseData.length} phases for build ${awsBuildId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Failed to save build phases for ${awsBuildId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * 사용자의 빌드 이력을 조회합니다
   *
   * @param userId - 사용자 ID
   * @param options - 조회 옵션
   * @returns 빌드 이력 목록
   */
  async getUserBuilds(
    userId: string,
    options?: BuildHistoryQueryOptions,
  ): Promise<BuildHistory[]> {
    try {
      let query = this.supabaseService
        .getClient()
        .from('build_histories')
        .select('*')
        .eq('user_id', userId);

      // 필터 적용
      if (options?.projectId) {
        query = query.eq('project_id', options.projectId);
      }
      if (options?.buildExecutionStatus) {
        query = query.eq(
          'build_execution_status',
          options.buildExecutionStatus,
        );
      }
      if (options?.startDate) {
        query = query.gte('created_at', options.startDate.toISOString());
      }
      if (options?.endDate) {
        query = query.lte('created_at', options.endDate.toISOString());
      }

      // 정렬 및 페이징
      query = query.order('created_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit || 50) - 1,
        );
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Failed to get user builds: ${error.message}`);
        throw error;
      }

      return (data || []).map((row) => this.mapDatabaseRowToBuildHistory(row));
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.logger.error(`Failed to get user builds for ${userId}: ${error}`);
      throw error;
    }
  }

  /**
   * 프로젝트의 빌드 이력을 조회합니다
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param options - 조회 옵션
   * @returns 프로젝트 빌드 이력 목록
   */
  async getProjectBuilds(
    userId: string,
    projectId: string,
    options?: BuildHistoryQueryOptions,
  ): Promise<BuildHistory[]> {
    return this.getUserBuilds(userId, { ...options, projectId });
  }

  /**
   * 특정 빌드의 상세 정보를 조회합니다
   *
   * @param userId - 사용자 ID
   * @param buildId - 빌드 ID
   * @returns 빌드 상세 정보
   * @throws {NotFoundException} 빌드를 찾을 수 없는 경우
   */
  async getBuildDetails(
    userId: string,
    buildId: string,
  ): Promise<BuildHistory> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data, error } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .select('*')
        .eq('id', buildId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        throw new NotFoundException(`Build not found: ${buildId}`);
      }

      return this.mapDatabaseRowToBuildHistory(data);
    } catch (error) {
      this.logger.error(
        `Failed to get build details for ${buildId}: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 빌드의 실행 단계별 정보를 조회합니다
   *
   * @param userId - 사용자 ID
   * @param buildId - 빌드 ID
   * @returns 빌드 실행 단계 목록
   */
  async getBuildPhases(
    userId: string,
    buildId: string,
  ): Promise<BuildExecutionPhase[]> {
    try {
      // 먼저 빌드가 사용자 소유인지 확인
      await this.getBuildDetails(userId, buildId);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('build_execution_phases')
        .select('*')
        .eq('build_history_id', buildId)
        .order('created_at', { ascending: true });

      if (error) {
        this.logger.error(`Failed to get build phases: ${error.message}`);
        throw error;
      }

      return (data || []).map((row) =>
        this.mapDatabaseRowToBuildExecutionPhase(row),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get build phases for ${buildId}: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 사용자의 빌드 통계를 조회합니다
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID (선택사항)
   * @returns 빌드 통계
   */
  async getBuildStats(
    userId: string,
    projectId?: string,
  ): Promise<BuildHistoryStats> {
    try {
      let query = this.supabaseService
        .getClient()
        .from('build_histories')
        .select('build_execution_status, duration_seconds')
        .eq('user_id', userId);

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Failed to get build stats: ${error.message}`);
        throw error;
      }

      const builds = data || [];
      const totalBuilds = builds.length;
      const succeededBuilds = builds.filter(
        (b) => b.build_execution_status === 'succeeded',
      ).length;
      const failedBuilds = builds.filter(
        (b) => b.build_execution_status === 'failed',
      ).length;

      const completedBuildsWithDuration = builds.filter(
        (b) =>
          (b.build_execution_status === 'succeeded' ||
            b.build_execution_status === 'failed') &&
          b.duration_seconds,
      );
      const averageDurationSeconds =
        completedBuildsWithDuration.length > 0
          ? completedBuildsWithDuration.reduce(
              (sum, b) => sum + (b.duration_seconds || 0),
              0,
            ) / completedBuildsWithDuration.length
          : 0;

      const successRate =
        totalBuilds > 0 ? (succeededBuilds / totalBuilds) * 100 : 0;

      return {
        totalBuilds,
        succeededBuilds,
        failedBuilds,
        averageDurationSeconds: Math.round(averageDurationSeconds),
        successRate: Math.round(successRate * 100) / 100,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get build stats for ${userId}: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * AWS CodeBuild ID로 빌드 조회
   *
   * @param awsBuildId - AWS CodeBuild ID
   * @returns 빌드 정보 또는 null
   */
  async getBuildByAwsId(awsBuildId: string): Promise<BuildHistory | null> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('build_histories')
        .select('*')
        .eq('aws_build_id', awsBuildId)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapDatabaseRowToBuildHistory(data);
    } catch (error) {
      this.logger.error(
        `Failed to get build by AWS ID ${awsBuildId}: ${String(error)}`,
      );
      return null;
    }
  }

  // ============================================================================
  // 레거시 메서드들 (하위 호환성을 위해 유지)
  // ============================================================================

  /**
   * @deprecated saveBuildStart를 사용하세요
   * 빌드 시작 시 초기 이력을 저장합니다 (레거시)
   *
   * @param request - 빌드 생성 요청 정보
   * @returns 생성된 빌드 객체
   */
  async saveBuildStart_Legacy(request: CreateBuildRequest): Promise<Build> {
    const buildHistory = await this.saveBuildStart(request);
    return this.mapBuildHistoryToBuild(buildHistory);
  }

  /**
   * @deprecated updateBuildStatus를 사용하세요
   * 빌드 상태를 업데이트합니다 (레거시)
   *
   * @param awsBuildId - AWS CodeBuild ID
   * @param updateData - 업데이트할 빌드 정보
   * @returns 업데이트된 빌드 객체
   */
  async updateBuildStatus_Legacy(
    awsBuildId: string,
    updateData: UpdateBuildRequest,
  ): Promise<Build> {
    const mappedUpdate: UpdateBuildHistoryRequest = {
      buildExecutionStatus: updateData.status,
      endTime: updateData.endTime,
      durationSeconds: updateData.duration,
      logsUrl: updateData.logsUrl,
      buildErrorMessage: updateData.errorMessage,
    };
    const buildHistory = await this.updateBuildStatus(awsBuildId, mappedUpdate);
    return this.mapBuildHistoryToBuild(buildHistory);
  }

  /**
   * @deprecated getUserBuilds를 사용하세요
   * 사용자의 빌드 이력을 조회합니다 (레거시)
   *
   * @param userId - 사용자 ID
   * @param options - 조회 옵션
   * @returns 빌드 이력 목록
   */
  async getUserBuilds_Legacy(
    userId: string,
    options?: BuildQueryOptions,
  ): Promise<Build[]> {
    const mappedOptions: BuildHistoryQueryOptions = {
      ...options,
      buildExecutionStatus: options?.status,
    };
    const buildHistories = await this.getUserBuilds(userId, mappedOptions);
    return buildHistories.map((history) =>
      this.mapBuildHistoryToBuild(history),
    );
  }

  /**
   * @deprecated getBuildDetails를 사용하세요
   * 특정 빌드의 상세 정보를 조회합니다 (레거시)
   *
   * @param userId - 사용자 ID
   * @param buildId - 빌드 ID
   * @returns 빌드 상세 정보
   */
  async getBuildDetails_Legacy(
    userId: string,
    buildId: string,
  ): Promise<Build> {
    const buildHistory = await this.getBuildDetails(userId, buildId);
    return this.mapBuildHistoryToBuild(buildHistory);
  }

  /**
   * @deprecated getBuildPhases를 사용하세요
   * 빌드의 실행 단계별 정보를 조회합니다 (레거시)
   *
   * @param userId - 사용자 ID
   * @param buildId - 빌드 ID
   * @returns 빌드 실행 단계 목록
   */
  async getBuildPhases_Legacy(
    userId: string,
    buildId: string,
  ): Promise<BuildPhase[]> {
    const phases = await this.getBuildPhases(userId, buildId);
    return phases.map((phase) =>
      this.mapBuildExecutionPhaseToBuildPhase(phase),
    );
  }

  /**
   * @deprecated getBuildStats를 사용하세요
   * 사용자의 빌드 통계를 조회합니다 (레거시)
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID (선택사항)
   * @returns 빌드 통계
   */
  async getBuildStats_Legacy(
    userId: string,
    projectId?: string,
  ): Promise<BuildStats> {
    const stats = await this.getBuildStats(userId, projectId);
    return {
      ...stats,
      averageDuration: stats.averageDurationSeconds,
    };
  }

  /**
   * 시작시간과 종료시간으로부터 지속시간을 계산합니다
   *
   * @private
   * @param startTime - 시작 시간
   * @param endTime - 종료 시간
   * @returns 지속시간(초) 또는 null
   */
  private calculateDuration(startTime?: Date, endTime?: Date): number | null {
    if (!startTime || !endTime) return null;
    return Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  }

  /**
   * 데이터베이스 행을 BuildHistory 객체로 매핑합니다
   *
   * @private
   * @param row - 데이터베이스 행
   * @returns BuildHistory 객체
   */
  private mapDatabaseRowToBuildHistory(row: Record<string, any>): BuildHistory {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      awsBuildId: row.aws_build_id,
      buildExecutionStatus: row.build_execution_status,
      buildSpec: row.build_spec,
      environmentVariables: row.environment_variables || undefined,
      startTime: row.start_time ? new Date(row.start_time) : undefined,
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      durationSeconds: row.duration_seconds,
      logsUrl: row.logs_url || undefined,
      buildErrorMessage: row.build_error_message || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * 데이터베이스 행을 BuildExecutionPhase 객체로 매핑합니다
   *
   * @private
   * @param row - 데이터베이스 행
   * @returns BuildExecutionPhase 객체
   */
  private mapDatabaseRowToBuildExecutionPhase(
    row: Record<string, any>,
  ): BuildExecutionPhase {
    return {
      id: row.id,
      buildHistoryId: row.build_history_id,
      phaseType: row.phase_type as PhaseType,
      phaseStatus: row.phase_status as PhaseStatus,
      phaseStartTime: row.phase_start_time
        ? new Date(row.phase_start_time)
        : undefined,
      phaseEndTime: row.phase_end_time
        ? new Date(row.phase_end_time)
        : undefined,
      phaseDurationSeconds: row.phase_duration_seconds,
      phaseContextMessage: row.phase_context_message || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  // ============================================================================
  // 레거시 매핑 메서드들
  // ============================================================================

  /**
   * BuildHistory를 Build 객체로 매핑합니다 (레거시)
   *
   * @private
   * @param buildHistory - 빌드 이력 객체
   * @returns 빌드 객체
   */
  private mapBuildHistoryToBuild(buildHistory: BuildHistory): Build {
    return {
      ...buildHistory,
      status: buildHistory.buildExecutionStatus,
      duration: buildHistory.durationSeconds,
      errorMessage: buildHistory.buildErrorMessage,
    };
  }

  /**
   * BuildExecutionPhase를 BuildPhase 객체로 매핑합니다 (레거시)
   *
   * @private
   * @param phase - 빌드 실행 단계 객체
   * @returns 빌드 단계 객체
   */
  private mapBuildExecutionPhaseToBuildPhase(
    phase: BuildExecutionPhase,
  ): BuildPhase {
    return {
      id: phase.id,
      buildId: phase.buildHistoryId,
      phaseType: phase.phaseType,
      phaseStatus: phase.phaseStatus,
      startTime: phase.phaseStartTime,
      endTime: phase.phaseEndTime,
      duration: phase.phaseDurationSeconds,
      contextMessage: phase.phaseContextMessage,
      createdAt: phase.createdAt,
    };
  }
}
