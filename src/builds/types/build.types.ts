/**
 * 빌드 실행 상태 타입
 * AWS CodeBuild의 빌드 상태를 나타내는 열거형
 */
export type BuildExecutionStatus =
  | 'pending' /** 대기 중 - 빌드가 아직 시작되지 않음 */
  | 'in_progress' /** 진행 중 - 빌드가 현재 실행 중 */
  | 'succeeded' /** 성공 - 빌드가 성공적으로 완료됨 */
  | 'failed' /** 실패 - 빌드가 오류로 인해 실패함 */
  | 'stopped' /** 중단됨 - 빌드가 사용자에 의해 중단됨 */
  | 'timed_out' /** 시간 초과 - 빌드가 제한 시간을 초과함 */
  | 'fault'; /** 오류 - 시스템 오류로 인한 실패 */

/**
 * 빌드 실행 단계 타입
 * AWS CodeBuild의 빌드 단계를 나타내는 열거형
 */
export type PhaseType =
  | 'SUBMITTED' /** 제출됨 - 빌드 요청이 제출됨 */
  | 'QUEUED' /** 대기열 - 빌드가 실행 대기열에 추가됨 */
  | 'PROVISIONING' /** 프로비저닝 - 빌드 환경을 준비 중 */
  | 'DOWNLOAD_SOURCE' /** 소스 다운로드 - 소스 코드를 다운로드 중 */
  | 'INSTALL' /** 설치 - 의존성 패키지 설치 중 */
  | 'PRE_BUILD' /** 빌드 전 - 빌드 전 준비 작업 중 */
  | 'BUILD' /** 빌드 - 실제 빌드 작업 실행 중 */
  | 'POST_BUILD' /** 빌드 후 - 빌드 후 정리 작업 중 */
  | 'UPLOAD_ARTIFACTS' /** 아티팩트 업로드 - 빌드 결과물 업로드 중 */
  | 'FINALIZING' /** 완료 중 - 빌드 프로세스 마무리 중 */
  | 'COMPLETED'; /** 완료됨 - 모든 빌드 단계가 완료됨 */

/**
 * 빌드 실행 단계 상태 타입
 * 각 빌드 단계의 실행 상태를 나타내는 열거형
 */
export type PhaseStatus =
  | 'SUCCEEDED' /** 성공 - 해당 단계가 성공적으로 완료됨 */
  | 'FAILED' /** 실패 - 해당 단계에서 오류가 발생함 */
  | 'FAULT' /** 오류 - 시스템 오류로 인한 실패 */
  | 'TIMED_OUT' /** 시간 초과 - 해당 단계가 제한 시간을 초과함 */
  | 'IN_PROGRESS' /** 진행 중 - 해당 단계가 현재 실행 중 */
  | 'STOPPED'; /** 중단됨 - 해당 단계가 중단됨 */

/**
 * 빌드 실행 이력 인터페이스
 * 데이터베이스의 build_histories 테이블과 매핑되는 인터페이스
 */
export interface BuildHistory {
  /** 빌드 이력의 고유 식별자 (UUID) */
  id: string;
  /** 빌드를 실행한 사용자의 ID (auth.users 테이블 참조) */
  userId: string;
  /** 빌드 대상 프로젝트의 ID */
  projectId: string;
  /** AWS CodeBuild에서 생성한 빌드 ID */
  awsBuildId: string;
  /** 현재 빌드 실행 상태 */
  buildExecutionStatus: BuildExecutionStatus;
  /** 빌드에 사용된 buildspec 설정 */
  buildSpec: object;
  /** 빌드 시 전달된 환경 변수들 */
  environmentVariables?: Record<string, string>;
  /** 빌드 시작 시간 */
  startTime?: Date;
  /** 빌드 종료 시간 */
  endTime?: Date;
  /** 빌드 소요 시간 (초 단위) */
  durationSeconds?: number;
  /** CloudWatch 로그 URL */
  logsUrl?: string;
  /** 빌드 실패 시 오류 메시지 */
  buildErrorMessage?: string;
  /** 레코드 생성 시간 */
  createdAt: Date;
  /** 레코드 마지막 수정 시간 */
  updatedAt: Date;
}

/**
 * 빌드 실행 단계 인터페이스
 * 데이터베이스의 build_execution_phases 테이블과 매핑되는 인터페이스
 */
export interface BuildExecutionPhase {
  /** 빌드 단계의 고유 식별자 (UUID) */
  id: string;
  /** 해당 단계가 속한 빌드 이력의 ID */
  buildHistoryId: string;
  /** 빌드 단계의 타입 (예: BUILD, INSTALL 등) */
  phaseType: PhaseType;
  /** 해당 단계의 현재 상태 */
  phaseStatus: PhaseStatus;
  /** 단계 시작 시간 */
  phaseStartTime?: Date;
  /** 단계 종료 시간 */
  phaseEndTime?: Date;
  /** 단계 소요 시간 (초 단위) */
  phaseDurationSeconds?: number;
  /** 단계별 추가 컨텍스트 메시지 또는 오류 정보 */
  phaseContextMessage?: string;
  /** 레코드 생성 시간 */
  createdAt: Date;
}

/**
 * 빌드 이력 생성 요청 인터페이스
 * 새로운 빌드 이력을 생성할 때 사용되는 데이터 구조
 */
export interface CreateBuildHistoryRequest {
  /** 빌드를 실행하는 사용자의 ID */
  userId: string;
  /** 빌드 대상 프로젝트의 ID */
  projectId: string;
  /** AWS CodeBuild에서 생성한 빌드 ID */
  awsBuildId: string;
  /** 빌드에 사용될 buildspec 설정 */
  buildSpec: object;
  /** 빌드 시 전달할 환경 변수들 */
  environmentVariables?: Record<string, string>;
  /** 빌드 시작 시간 (선택사항, 미지정 시 현재 시간 사용) */
  startTime?: Date;
  /** 빌드와 연결된 파이프라인 ID */
  pipelineId?: string;
  /** 빌드 시점의 파이프라인 데이터 스냅샷 */
  pipelineData?: unknown;
}

/**
 * 빌드 이력 업데이트 요청 인터페이스
 * 기존 빌드 이력을 업데이트할 때 사용되는 데이터 구조
 */
export interface UpdateBuildHistoryRequest {
  /** 업데이트할 빌드 실행 상태 */
  buildExecutionStatus?: BuildExecutionStatus;
  /** 빌드 종료 시간 */
  endTime?: Date;
  /** 빌드 소요 시간 (초 단위) */
  durationSeconds?: number;
  /** CloudWatch 로그 URL */
  logsUrl?: string;
  /** 빌드 실패 시 오류 메시지 */
  buildErrorMessage?: string;
}

/**
 * 빌드 이력 조회 옵션 인터페이스
 * 빌드 이력을 검색하고 필터링할 때 사용되는 옵션들
 */
export interface BuildHistoryQueryOptions {
  /** 특정 사용자의 빌드 이력만 조회 */
  userId?: string;
  /** 특정 프로젝트의 빌드 이력만 조회 */
  projectId?: string;
  /** 특정 상태의 빌드 이력만 조회 */
  buildExecutionStatus?: BuildExecutionStatus;
  /** 조회할 최대 레코드 수 (페이징) */
  limit?: number;
  /** 건너뛸 레코드 수 (페이징) */
  offset?: number;
  /** 조회 시작 날짜 */
  startDate?: Date;
  /** 조회 종료 날짜 */
  endDate?: Date;
}

/**
 * 빌드 통계 인터페이스
 * 빌드 이력에 대한 통계 정보를 담는 데이터 구조
 */
export interface BuildHistoryStats {
  /** 전체 빌드 수 */
  totalBuilds: number;
  /** 성공한 빌드 수 */
  succeededBuilds: number;
  /** 실패한 빌드 수 */
  failedBuilds: number;
  /** 평균 빌드 소요 시간 (초 단위) */
  averageDurationSeconds: number;
  /** 빌드 성공률 (0-1 사이의 값) */
  successRate: number;
}

// ============================================================================
// 레거시 타입들 (하위 호환성을 위해 유지)
// ============================================================================

/**
 * @deprecated BuildExecutionStatus를 사용하세요
 * 빌드 상태 타입 (레거시)
 */
export type BuildStatus = BuildExecutionStatus;

/**
 * @deprecated BuildHistory를 사용하세요
 * 빌드 인터페이스 (레거시)
 * 기존 코드와의 호환성을 위해 유지되는 타입
 */
export interface Build
  extends Omit<
    BuildHistory,
    'buildExecutionStatus' | 'durationSeconds' | 'buildErrorMessage'
  > {
  /** 빌드 상태 (레거시 필드명) */
  status: BuildExecutionStatus;
  /** 빌드 소요 시간 (레거시 필드명) */
  duration?: number;
  /** 빌드 오류 메시지 (레거시 필드명) */
  errorMessage?: string;
}

/**
 * @deprecated BuildExecutionPhase를 사용하세요
 * 빌드 단계 인터페이스 (레거시)
 * 기존 코드와의 호환성을 위해 유지되는 타입
 */
export interface BuildPhase
  extends Omit<
    BuildExecutionPhase,
    | 'buildHistoryId'
    | 'phaseStartTime'
    | 'phaseEndTime'
    | 'phaseDurationSeconds'
    | 'phaseContextMessage'
  > {
  /** 빌드 ID (레거시 필드명) */
  buildId: string;
  /** 단계 시작 시간 (레거시 필드명) */
  startTime?: Date;
  /** 단계 종료 시간 (레거시 필드명) */
  endTime?: Date;
  /** 단계 소요 시간 (레거시 필드명) */
  duration?: number;
  /** 단계 컨텍스트 메시지 (레거시 필드명) */
  contextMessage?: string;
}

/**
 * @deprecated CreateBuildHistoryRequest를 사용하세요
 * 빌드 생성 요청 인터페이스 (레거시)
 */
export interface CreateBuildRequest
  extends Omit<CreateBuildHistoryRequest, 'buildSpec'> {
  /** 빌드 스펙 설정 */
  buildSpec: object;
}

/**
 * @deprecated UpdateBuildHistoryRequest를 사용하세요
 * 빌드 업데이트 요청 인터페이스 (레거시)
 */
export interface UpdateBuildRequest
  extends Omit<
    UpdateBuildHistoryRequest,
    'buildExecutionStatus' | 'durationSeconds' | 'buildErrorMessage'
  > {
  /** 빌드 상태 (레거시 필드명) */
  status?: BuildExecutionStatus;
  /** 빌드 소요 시간 (레거시 필드명) */
  duration?: number;
  /** 빌드 오류 메시지 (레거시 필드명) */
  errorMessage?: string;
}

/**
 * @deprecated BuildHistoryQueryOptions를 사용하세요
 * 빌드 조회 옵션 인터페이스 (레거시)
 */
export interface BuildQueryOptions
  extends Omit<BuildHistoryQueryOptions, 'buildExecutionStatus'> {
  /** 빌드 상태 (레거시 필드명) */
  status?: BuildExecutionStatus;
}

/**
 * @deprecated BuildHistoryStats를 사용하세요
 * 빌드 통계 인터페이스 (레거시)
 */
export interface BuildStats
  extends Omit<BuildHistoryStats, 'averageDurationSeconds'> {
  /** 평균 빌드 소요 시간 (레거시 필드명) */
  averageDuration: number;
}
