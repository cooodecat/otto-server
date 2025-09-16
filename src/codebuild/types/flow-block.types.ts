/**
 * @fileoverview FlowBlock 기반 파이프라인 타입 정의
 * @description otto-ui의 FlowEditor에서 생성되는 블록 구조를 정의하고,
 * AWS CodeBuild buildspec.yml로 변환하기 위한 타입 시스템을 제공합니다.
 * @module flow-block.types
 */

/**
 * 블록 타입을 정의하는 열거형
 * @description 각 블록이 수행하는 작업의 종류를 구분합니다.
 * @enum {string}
 */
export enum BlockTypeEnum {
  /** Node.js 패키지 매니저 (npm, yarn, pnpm) */
  NODE_PACKAGE_MANAGER = 'node_package_manager',
  /** OS 패키지 매니저 (apt, yum, brew 등) */
  OS_PACKAGE_MANAGER = 'os_package_manager',
  /** 커스텀 빌드 명령어 */
  CUSTOM_BUILD_COMMAND = 'custom_build_command',
  /** Node.js 테스트 명령어 */
  NODE_TEST_COMMAND = 'node_test_command',
  /** 커스텀 실행 명령어 */
  CUSTOM_RUN_COMMAND = 'custom_run_command',
  /** 커스텀 테스트 명령어 */
  CUSTOM_TEST_COMMAND = 'custom_test_command',
}

/**
 * 블록 그룹 타입을 정의하는 열거형
 * @description 블록이 속한 그룹을 구분하여 AWS CodeBuild의 어느 단계(phase)에서 실행될지 결정합니다.
 * - BUILD: build 단계에서 실행
 * - TEST: post_build 단계 초반부에서 실행
 * - RUN: post_build 단계 후반부에서 실행
 * - CUSTOM: pre_build 단계에서 실행
 * @enum {string}
 */
export enum BlockGroupType {
  /** 테스트 관련 블록 (post_build 초반부) */
  TEST = 'test',
  /** 실행 관련 블록 (post_build 후반부) */
  RUN = 'run',
  /** 빌드 관련 블록 (build 단계) */
  BUILD = 'build',
  /** 커스텀 블록 (pre_build 단계) */
  CUSTOM = 'custom',
}

/**
 * 기본 FlowBlock 인터페이스
 * @description 모든 FlowBlock 타입의 기본 구조를 정의합니다.
 * on_success와 on_failed를 통해 조건부 플로우 제어가 가능합니다.
 *
 * @example
 * // 테스트 성공 시 다음 테스트로, 실패 시 알림 블록으로 이동
 * {
 *   id: "test-1",
 *   block_type: BlockTypeEnum.NODE_TEST_COMMAND,
 *   group_type: BlockGroupType.TEST,
 *   on_success: "test-2",  // 성공 시 test-2 블록 실행
 *   on_failed: "notify-failure"  // 실패 시 알림 블록 실행
 * }
 *
 * @interface FlowBlock
 */
export interface FlowBlock {
  /** 블록 고유 아이디 (uuid) */
  id: string;

  /** 블록 타입 (작업 종류) */
  block_type: BlockTypeEnum;

  /** 블록 그룹 타입 (실행 단계) */
  group_type: BlockGroupType;

  /**
   * 성공 시 실행할 다음 블록 ID
   * @description 현재 블록이 성공적으로 실행되면 이 ID에 해당하는 블록이 실행됩니다.
   * 비어있으면 다음 순서의 블록이 실행됩니다.
   */
  on_success?: string;

  /**
   * 실패 시 실행할 다음 블록 ID
   * @description 현재 블록 실행이 실패하면 이 ID에 해당하는 블록이 실행됩니다.
   * 예: 테스트 실패 시 알림 전송, 빌드 실패 시 롤백 등
   */
  on_failed?: string;
}

/**
 * OS 패키지 매니저 블록
 * @description 운영체제 레벨의 패키지를 설치하는 블록입니다.
 * apt-get, yum, brew 등의 패키지 매니저를 지원합니다.
 * @interface OSPackageBlock
 * @extends {FlowBlock}
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
 * @description Node.js 프로젝트의 의존성을 관리하는 블록입니다.
 * npm, yarn, pnpm 등의 패키지 매니저를 지원합니다.
 * @interface NodePackageBlock
 * @extends {FlowBlock}
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
 * @description 사용자 정의 빌드 명령어를 실행하는 블록입니다.
 * 컴파일, 번들링 등 빌드 관련 작업을 수행합니다.
 * BUILD 그룹에서는 빌드 작업을, CUSTOM 그룹에서는 사전 설정 작업을 수행합니다.
 * @interface CustomBuildBlock
 * @extends {FlowBlock}
 */
export interface CustomBuildBlock extends FlowBlock {
  block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND;
  group_type: BlockGroupType.BUILD | BlockGroupType.CUSTOM;
  /** 커스텀 빌드 명령어 */
  custom_command: string[];
}

/**
 * Node.js 테스트 명령어 블록
 * @description Node.js 프로젝트의 테스트를 실행하는 블록입니다.
 * npm test, yarn test 등의 테스트 스크립트를 실행합니다.
 * @interface NodeTestCommand
 * @extends {FlowBlock}
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
 * @description 빌드 후 실행되는 사용자 정의 명령어 블록입니다.
 * 배포, 알림 전송, 아티팩트 업로드 등의 작업을 수행합니다.
 * @interface CustomRunCommand
 * @extends {FlowBlock}
 */
export interface CustomRunCommand extends FlowBlock {
  block_type: BlockTypeEnum.CUSTOM_RUN_COMMAND;
  group_type: BlockGroupType.RUN;
  /** 커스텀 실행 명령어 */
  custom_command: string[];
}

/**
 * 커스텀 테스트 명령어 블록
 * @description 사용자 정의 테스트 명령어를 실행하는 블록입니다.
 * 통합 테스트, E2E 테스트 등 다양한 테스트를 수행합니다.
 * @interface CustomTestCommand
 * @extends {FlowBlock}
 */
export interface CustomTestCommand extends FlowBlock {
  block_type: BlockTypeEnum.CUSTOM_TEST_COMMAND;
  group_type: BlockGroupType.TEST;
  /** 커스텀 테스트 명령어 */
  custom_command: string[];
}

/**
 * 모든 FlowBlock 타입의 유니온
 * @description 파이프라인에서 사용 가능한 모든 블록 타입을 포함합니다.
 * @typedef {OSPackageBlock | NodePackageBlock | CustomBuildBlock | NodeTestCommand | CustomRunCommand | CustomTestCommand} FlowBlockUnion
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
 * @description 전체 파이프라인 구성을 정의하는 최상위 인터페이스입니다.
 * FlowBlock 배열과 함께 환경 설정, 아티팩트, 캐시 등을 포함합니다.
 *
 * @example
 * const pipeline: FlowPipelineInput = {
 *   version: "0.2",
 *   runtime: "node:18",
 *   blocks: [
 *     {
 *       id: "install",
 *       block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER,
 *       group_type: BlockGroupType.BUILD,
 *       package_manager: "npm",
 *       package_list: [],
 *       on_success: "build"
 *     },
 *     {
 *       id: "build",
 *       block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
 *       group_type: BlockGroupType.BUILD,
 *       custom_command: ["npm run build"],
 *       on_success: "test",
 *       on_failed: "cleanup"
 *     }
 *   ],
 *   artifacts: ["dist/**"],
 *   environment_variables: {
 *     NODE_ENV: "production"
 *   }
 * };
 *
 * @interface FlowPipelineInput
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
