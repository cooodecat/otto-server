import type {
  BuildPhase as AWSBuildPhase,
  LogsLocation as AWSLogsLocation,
} from '@aws-sdk/client-codebuild';

/**
 * 빌드 시작 응답 인터페이스
 *
 * AWS CodeBuild에서 빌드를 시작했을 때 반환되는 기본 정보를 정의합니다.
 * 빌드 ID, 상태, 프로젝트명, 시작 시간 등의 정보를 포함합니다.
 *
 * @since 1.0.0
 */
export interface BuildResponse {
  /** AWS CodeBuild 빌드 고유 ID */
  buildId: string;
  /** 현재 빌드 상태 (SUCCEEDED, FAILED, IN_PROGRESS 등) */
  buildStatus: string;
  /** AWS CodeBuild 프로젝트명 */
  projectName: string;
  /** 빌드 시작 시간 (선택사항) */
  startTime?: Date;
}

/**
 * 빌드 상태 조회 응답 인터페이스
 *
 * AWS CodeBuild에서 빌드 상태를 조회했을 때 반환되는 상세 정보를 정의합니다.
 * 기본 빌드 정보 외에 종료 시간, 현재 단계, 단계별 상세 정보, 로그 위치 등을 포함합니다.
 *
 * @extends BuildResponse
 * @since 1.0.0
 */
export interface BuildStatusResponse {
  /** AWS CodeBuild 빌드 고유 ID */
  buildId: string;
  /** 현재 빌드 상태 (SUCCEEDED, FAILED, IN_PROGRESS 등) */
  buildStatus: string;
  /** AWS CodeBuild 프로젝트명 */
  projectName: string;
  /** 빌드 시작 시간 (선택사항) */
  startTime?: Date;
  /** 빌드 종료 시간 (완료된 경우에만) */
  endTime?: Date;
  /** 현재 실행 중인 빌드 단계 */
  currentPhase?: string;
  /** 빌드 단계별 상세 정보 (AWS SDK 타입) */
  phases?: AWSBuildPhase[];
  /** 빌드 로그 위치 정보 (AWS SDK 타입) */
  logs?: AWSLogsLocation;
}

/**
 * AWS CodeBuild 빌드 상태 열거형
 *
 * AWS CodeBuild에서 사용하는 빌드 상태값들을 정의합니다.
 * 빌드의 생명주기 동안 발생할 수 있는 모든 상태를 포함합니다.
 *
 * @enum {string}
 * @since 1.0.0
 */
export enum BuildStatus {
  /** 빌드가 성공적으로 완료됨 */
  SUCCEEDED = 'SUCCEEDED',
  /** 빌드가 실패함 */
  FAILED = 'FAILED',
  /** 빌드 중 시스템 오류 발생 */
  FAULT = 'FAULT',
  /** 빌드가 시간 초과로 중단됨 */
  TIMED_OUT = 'TIMED_OUT',
  /** 빌드가 현재 진행 중 */
  IN_PROGRESS = 'IN_PROGRESS',
  /** 빌드가 사용자에 의해 중단됨 */
  STOPPED = 'STOPPED',
}

/**
 * AWS CodeBuild 빌드 단계 타입 열거형
 *
 * AWS CodeBuild에서 빌드 과정 중 발생하는 각 단계의 타입을 정의합니다.
 * 빌드 제출부터 완료까지의 모든 단계를 순서대로 나열합니다.
 *
 * @enum {string}
 * @since 1.0.0
 */
export enum PhaseType {
  /** 빌드 요청이 제출됨 */
  SUBMITTED = 'SUBMITTED',
  /** 빌드가 대기열에 추가됨 */
  QUEUED = 'QUEUED',
  /** 빌드 환경을 프로비저닝 중 */
  PROVISIONING = 'PROVISIONING',
  /** 소스 코드 다운로드 중 */
  DOWNLOAD_SOURCE = 'DOWNLOAD_SOURCE',
  /** 종속성 설치 중 */
  INSTALL = 'INSTALL',
  /** 빌드 전 작업 실행 중 */
  PRE_BUILD = 'PRE_BUILD',
  /** 메인 빌드 작업 실행 중 */
  BUILD = 'BUILD',
  /** 빌드 후 작업 실행 중 */
  POST_BUILD = 'POST_BUILD',
  /** 아티팩트 업로드 중 */
  UPLOAD_ARTIFACTS = 'UPLOAD_ARTIFACTS',
  /** 빌드 마무리 작업 중 */
  FINALIZING = 'FINALIZING',
  /** 빌드가 완전히 완료됨 */
  COMPLETED = 'COMPLETED',
}

/**
 * AWS CodeBuild 빌드 단계 상태 열거형
 *
 * 각 빌드 단계가 가질 수 있는 상태값들을 정의합니다.
 * BuildStatus와 동일한 값들을 가지지만 개별 단계 레벨에서 사용됩니다.
 *
 * @enum {string}
 * @since 1.0.0
 */
export enum PhaseStatus {
  /** 단계가 성공적으로 완료됨 */
  SUCCEEDED = 'SUCCEEDED',
  /** 단계가 실패함 */
  FAILED = 'FAILED',
  /** 단계 중 시스템 오류 발생 */
  FAULT = 'FAULT',
  /** 단계가 시간 초과로 중단됨 */
  TIMED_OUT = 'TIMED_OUT',
  /** 단계가 현재 진행 중 */
  IN_PROGRESS = 'IN_PROGRESS',
  /** 단계가 사용자에 의해 중단됨 */
  STOPPED = 'STOPPED',
}
