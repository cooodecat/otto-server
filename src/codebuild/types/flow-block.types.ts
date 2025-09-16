/**
 * FlowBlock 기반 파이프라인 타입 정의
 * otto-ui의 FlowEditor에서 생성되는 블록 구조를 정의합니다.
 */

export enum BlockTypeEnum {
  /** Node.js 패키지 매니저 (npm, yarn, pnpm) */
  NODE_PACKAGE_MANAGER = "node_package_manager",
  /** OS 패키지 매니저 (apt, yum, brew 등) */
  OS_PACKAGE_MANAGER = "os_package_manager",
  /** 커스텀 빌드 명령어 */
  CUSTOM_BUILD_COMMAND = "custom_build_command",
  /** Node.js 테스트 명령어 */
  NODE_TEST_COMMAND = "node_test_command",
  /** 커스텀 실행 명령어 */
  CUSTOM_RUN_COMMAND = "custom_run_command",
  /** 커스텀 테스트 명령어 */
  CUSTOM_TEST_COMMAND = "custom_test_command"
}

export enum BlockGroupType {
  /** 테스트 관련 블록 */
  TEST = "test",
  /** 실행 관련 블록 */
  RUN = "run",
  /** 빌드 관련 블록 */
  BUILD = "build",
  /** 커스텀 블록 */
  CUSTOM = "custom"
}

/**
 * 기본 FlowBlock 인터페이스
 */
export interface FlowBlock {
  /** 블록 고유 아이디 (uuid) */
  id: string;
  /** 무슨 블록인지 */
  block_type: BlockTypeEnum;
  /** 블록 그룹 타입 */
  group_type: BlockGroupType;
  /** 성공했을 시 이 쪽 블록 아이디로 이동 (uuid) */
  on_success: string;
  /** 실패할 시 이 쪽 블록 아이디로 이동 (uuid) */
  on_failed?: string;
}

/**
 * OS 패키지 매니저 블록
 */
export interface OSPackageBlock extends FlowBlock {
  block_type: BlockTypeEnum.OS_PACKAGE_MANAGER;
  group_type: BlockGroupType.BUILD;
  /** 무슨 패키지 종류인지 (apt, yum, brew 등) */
  package_manager: string;
  /** 패키지 목록 */
  package_list: string[];
}

/**
 * Node.js 패키지 매니저 블록
 */
export interface NodePackageBlock extends FlowBlock {
  block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER;
  group_type: BlockGroupType.BUILD;
  /** 무슨 패키지 종류인지 (npm, yarn, pnpm) */
  package_manager: string;
  /** 패키지 목록 */
  package_list: string[];
}

/**
 * 커스텀 빌드 명령어 블록
 */
export interface CustomBuildBlock extends FlowBlock {
  block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND;
  group_type: BlockGroupType.BUILD;
  /** 커스텀 빌드 명령어 */
  custom_command: string[];
}

/**
 * Node.js 테스트 명령어 블록
 */
export interface NodeTestCommand extends FlowBlock {
  block_type: BlockTypeEnum.NODE_TEST_COMMAND;
  group_type: BlockGroupType.TEST;
  /** 패키지 종류 (npm, yarn, pnpm) */
  package_manager: string;
  /** 테스트 명령어 목록 */
  test_command: string[];
}

/**
 * 커스텀 실행 명령어 블록
 */
export interface CustomRunCommand extends FlowBlock {
  block_type: BlockTypeEnum.CUSTOM_RUN_COMMAND;
  group_type: BlockGroupType.RUN;
  /** 커스텀 실행 명령어 */
  custom_command: string[];
}

/**
 * 커스텀 테스트 명령어 블록
 */
export interface CustomTestCommand extends FlowBlock {
  block_type: BlockTypeEnum.CUSTOM_TEST_COMMAND;
  group_type: BlockGroupType.TEST;
  /** 커스텀 테스트 명령어 */
  custom_command: string[];
}

/**
 * 모든 FlowBlock 타입의 유니온
 */
export type FlowBlockUnion = 
  | OSPackageBlock 
  | NodePackageBlock 
  | CustomBuildBlock 
  | NodeTestCommand 
  | CustomRunCommand 
  | CustomTestCommand;

/**
 * FlowBlock 기반 파이프라인 입력 인터페이스
 */
export interface FlowPipelineInput {
  /** buildspec 버전 (기본값: '0.2') */
  version?: string;
  /** 런타임 환경 (예: 'node:18', 'python:3.9') */
  runtime?: string;
  /** FlowBlock 배열 */
  blocks: FlowBlockUnion[];
  /** 빌드 아티팩트 파일 목록 */
  artifacts?: string[];
  /** 환경 변수 */
  environment_variables?: Record<string, string>;
  /** 캐시 설정 */
  cache?: {
    /** 캐시할 경로 목록 */
    paths?: string[];
  };
  /** 테스트 리포트 설정 */
  reports?: Record<
    string,
    {
      /** 리포트 파일 목록 */
      files: string[];
      /** 파일 형식 */
      'file-format'?:
        | 'JUNITXML'
        | 'CUCUMBERJSON'
        | 'TESTNGXML'
        | 'CLOVERXML'
        | 'VISUALSTUDIOTRX'
        | 'JACOCOXML'
        | 'NUNITXML'
        | 'NUNIT3XML';
      /** 기본 디렉토리 */
      'base-directory'?: string;
      /** 경로 제거 여부 */
      'discard-paths'?: boolean;
    }
  >;
  /** 실패 시 동작 */
  on_failure?: 'ABORT' | 'CONTINUE';
  /** AWS Secrets Manager 시크릿 */
  secrets?: Record<string, string>;
}
