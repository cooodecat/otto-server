import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
  CreateProjectCommand,
  CreateProjectCommandOutput,
} from '@aws-sdk/client-codebuild';
import * as yaml from 'js-yaml';
import { BuildsService } from '../builds/builds.service';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * buildspec.yml 입력 인터페이스
 * JSON 형태의 빌드 설정을 정의하는 인터페이스
 */
export interface BuildSpecInput {
  /** buildspec 버전 (기본값: '0.2') */
  version?: string;
  /** 런타임 환경 (예: 'node:18', 'python:3.9') */
  runtime?: string;
  /** 빌드 단계별 명령어 */
  commands: {
    /** 설치 단계 명령어 */
    install?: string[];
    /** 빌드 전 단계 명령어 */
    pre_build?: string[];
    /** 빌드 단계 명령어 */
    build?: string[];
    /** 빌드 후 단계 명령어 */
    post_build?: string[];
    /** 최종 단계 명령어 */
    finally?: string[];
  };
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
import {
  FlowPipelineInput,
  BlockTypeEnum,
  BlockGroupType,
  FlowBlockUnion,
} from './types/flow-block.types';

/**
 * AWS CodeBuild buildspec.yml 형식 인터페이스
 *
 * @description
 * AWS CodeBuild에서 사용하는 표준 buildspec.yml 구조를 TypeScript 인터페이스로 정의합니다.
 * 이 인터페이스는 YAML로 변환되어 AWS CodeBuild에서 빌드 실행시 사용됩니다.
 *
 * @see {@link https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html}
 * @interface BuildSpecYaml
 */
export interface BuildSpecYaml {
  /**
   * buildspec 버전
   * @default '0.2'
   * @example '0.2'
   */
  version: string;

  /**
   * 빌드 단계별 설정
   * 각 단계는 순차적으로 실행되며, 실패 시 동작을 설정할 수 있습니다.
   */
  phases: {
    /**
     * 설치 단계 (install phase)
     * 빌드 환경의 런타임과 의존성을 설정합니다.
     */
    install?: {
      /**
       * 런타임 버전 설정
       * @example { nodejs: '18', python: '3.9' }
       */
      'runtime-versions'?: Record<string, string>;

      /** 설치 명령어 배열 */
      commands?: string[];

      /**
       * 실패 시 동작
       * - ABORT: 빌드 중단
       * - CONTINUE: 계속 진행
       */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /**
     * 빌드 전 단계 (pre_build phase)
     * 빌드를 위한 준비 작업을 수행합니다.
     * 예: 환경 설정, 인증, 의존성 검사 등
     */
    pre_build?: {
      /** 빌드 전 실행할 명령어 배열 */
      commands?: string[];

      /**
       * 실패 시 동작 설정
       * @default 'ABORT'
       */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /**
     * 빌드 단계 (build phase)
     * 실제 빌드 작업을 수행합니다.
     * 예: 컴파일, 테스트, 패키징 등
     */
    build?: {
      /** 빌드 실행 명령어 배열 */
      commands?: string[];

      /**
       * 실패 시 동작 설정
       * @default 'ABORT'
       */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /**
     * 빌드 후 단계 (post_build phase)
     * 빌드 완료 후 작업을 수행합니다.
     * 예: 테스트 실행, 아티팩트 업로드, 배포 등
     */
    post_build?: {
      /** 빌드 후 실행할 명령어 배열 */
      commands?: string[];

      /**
       * 실패 시 동작 설정
       * 테스트의 경우 CONTINUE로 설정하여 실패해도 계속 진행
       * @default 'CONTINUE'
       */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /**
     * 최종 단계 (finally phase)
     * 빌드 성공/실패와 관계없이 항상 실행됩니다.
     * 예: 정리 작업, 알림 전송 등
     */
    finally?: {
      /** 항상 실행할 명령어 배열 */
      commands?: string[];
    };
  };
  /**
   * 아티팩트 설정
   * 빌드 결과물로 저장할 파일을 지정합니다.
   */
  artifacts?: {
    /**
     * 아티팩트로 저장할 파일 목록
     * glob 패턴 지원 (**, *, ?)
     * @example ["dist/**\/*", "package.json"]
     */
    files: string[];
  };
  /**
   * 환경 설정
   * 빌드 실행 시 사용할 환경 변수 및 시크릿을 설정합니다.
   */
  env?: {
    /**
     * 환경 변수
     * @example { NODE_ENV: "production", API_URL: "https://api.example.com" }
     */
    variables?: Record<string, string>;

    /**
     * AWS Secrets Manager 시크릿
     * ARN 형식으로 지정
     * @example { API_KEY: "arn:aws:secretsmanager:region:account:secret:name" }
     */
    'secrets-manager'?: Record<string, string>;
  };
  /**
   * 캐시 설정
   * 빌드 속도 향상을 위해 캐시할 디렉토리를 지정합니다.
   */
  cache?: {
    /**
     * 캐시할 경로 목록
     * @example ["node_modules/**\/*", ".npm/**\/*"]
     */
    paths?: string[];
  };
  /**
   * 테스트 리포트 설정
   * 테스트 결과를 AWS CodeBuild 리포트로 전송합니다.
   */
  reports?: Record<
    string,
    {
      /** 리포트 파일 목록 */
      files: string[];

      /**
       * 파일 형식
       * @example "JUNITXML", "CUCUMBERJSON", "TESTNGXML"
       */
      'file-format'?: string;

      /** 기본 디렉토리 */
      'base-directory'?: string;

      /** 경로 제거 여부 */
      'discard-paths'?: boolean;
    }
  >;
}

/**
 * 멀티테넌트 AWS CodeBuild 서비스
 *
 * 사용자별로 독립된 CodeBuild 프로젝트에서 빌드를 실행합니다.
 * JSON 형태의 빌드 설정을 AWS CodeBuild buildspec.yml로 변환하여 실행합니다.
 *
 * @example
 * ```typescript
 * // 특정 프로젝트에서 빌드 실행
 * const result = await codeBuildService.startBuildFromJson(
 *   'user-123',
 *   'proj_123',
 *   buildConfig
 * );
 * ```
 */
@Injectable()
export class CodeBuildService {
  private readonly logger = new Logger(CodeBuildService.name);
  private readonly codeBuildClient: CodeBuildClient;

  /**
   * CodeBuildService 생성자
   *
   * AWS CodeBuild 클라이언트를 초기화합니다.
   * 더 이상 고정된 CodeBuild 프로젝트명을 사용하지 않고, 런타임에 동적으로 결정합니다.
   *
   * @param configService - 환경 설정 서비스
   * @param buildsService - 빌드 이력 관리 서비스
   * @throws {Error} AWS 자격 증명이 누락된 경우
   */
  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BuildsService))
    private readonly buildsService: BuildsService,
    private readonly supabaseService: SupabaseService,
  ) {
    // AWS 설정 로드
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const sessionToken = this.configService.get<string>('AWS_SESSION_TOKEN');

    // AWS 자격 증명 검증
    this.logger.log(`[CodeBuildService] AWS 자격 증명 확인:`, {
      region,
      accessKeyId: accessKeyId ? `${accessKeyId.substring(0, 10)}...` : '누락',
      secretAccessKey: secretAccessKey
        ? `${secretAccessKey.substring(0, 10)}...`
        : '누락',
      sessionToken: sessionToken
        ? `${sessionToken.substring(0, 10)}...`
        : '누락',
      isTemporaryCredentials: accessKeyId?.startsWith('ASIA'),
    });

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials are required: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
      );
    }

    // CodeBuild 클라이언트 초기화
    const credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    } = {
      accessKeyId,
      secretAccessKey,
    };

    // 임시 자격 증명인 경우 SessionToken 추가
    if (sessionToken) {
      credentials.sessionToken = sessionToken;
      this.logger.log(
        `[CodeBuildService] 임시 자격 증명 사용 - SessionToken 추가됨`,
      );
    } else {
      this.logger.log(
        `[CodeBuildService] 영구 자격 증명 사용 - SessionToken 없음`,
      );
    }

    this.logger.log(`[CodeBuildService] CodeBuild 클라이언트 초기화:`, {
      region,
      hasSessionToken: !!sessionToken,
      credentialType: sessionToken ? 'Temporary' : 'Permanent',
    });

    this.codeBuildClient = new CodeBuildClient({
      region,
      credentials,
    });
  }

  /**
   * FlowBlock 기반 파이프라인을 AWS CodeBuild buildspec.yml로 변환합니다
   *
   * 처리 흐름:
   * 1. 각 블록은 group_type에 따라 해당 단계에서만 실행됩니다
   * 2. on_success/on_failed는 단순히 다음 블록 ID를 참조하는 메타데이터입니다
   * 3. 실제 체인 실행은 각 그룹 내에서 블록 순서대로 처리됩니다
   *
   * @param input - FlowBlock 기반 파이프라인 설정
   * @returns YAML 형식의 buildspec 문자열
   *
   * @example
   * ```typescript
   * const buildSpec = convertFlowPipelineToBuildSpec({
   *   version: "0.2",
   *   runtime: "node:18",
   *   blocks: [
   *     {
   *       id: "install-deps",
   *       block_type: "node_package_manager",
   *       group_type: "build",
   *       on_success: "build-app",
   *       package_manager: "npm",
   *       package_list: []
   *     }
   *   ]
   * });
   * ```
   */
  convertFlowPipelineToBuildSpec(input: FlowPipelineInput): string {
    const buildSpec: BuildSpecYaml = {
      version: input.version || '0.2',
      phases: {},
    };

    // 런타임 설정 처리
    if (input.runtime) {
      const runtimeParts = input.runtime.includes(':')
        ? input.runtime.split(':')
        : [input.runtime, 'latest'];
      const [runtimeName, version] = runtimeParts;

      buildSpec.phases.install = {
        'runtime-versions': {
          [runtimeName]: version,
        },
      };
    }

    /**
     * 블록들을 그룹별로 분류 (순서 유지)
     *
     * FlowBlock을 group_type에 따라 분류하여 각 buildspec phase에 배치합니다:
     * - CUSTOM -> pre_build: 빌드 준비 단계 (환경 설정, 인증 등)
     * - BUILD -> build: 메인 빌드 단계 (컴파일, 패키징 등)
     * - TEST -> post_build (초반): 테스트 실행
     * - RUN -> post_build (후반): 배포 및 아티팩트 처리
     */
    const buildBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.BUILD,
    );
    const testBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.TEST,
    );
    const runBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.RUN,
    );
    const customBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.CUSTOM,
    );

    /**
     * BUILD 그룹 처리 - build phase에 배치
     *
     * 메인 빌드 작업을 처리합니다.
     * - 패키지 매니저 블록은 실패 시 즉시 중단 (fail fast)
     * - 일반 빌드 블록은 on_failed 설정 시 조건부 실행 가능
     */
    if (buildBlocks.length > 0) {
      const buildCommands: string[] = [];

      buildBlocks.forEach((block) => {
        // 해당 블록의 실제 명령어 가져오기
        const blockCommands = this.getBlockCommandsById(input.blocks, block.id);

        /**
         * 패키지 매니저 블록 확인
         *
         * 패키지 매니저는 시스템의 기본 의존성을 설치하므로
         * 실패 시 fallback을 허용하지 않고 즉시 빌드를 중단합니다.
         */
        const isPackageManagerBlock =
          block.block_type === BlockTypeEnum.OS_PACKAGE_MANAGER ||
          block.block_type === BlockTypeEnum.NODE_PACKAGE_MANAGER;

        if (block.on_failed && !isPackageManagerBlock) {
          /**
           * 조건부 실행 로직 (if/then/else 구문)
           *
           * on_failed가 설정된 경우 bash의 if/then/else를 사용하여
           * 성공 시 on_success 블록을, 실패 시 on_failed 블록을 실행합니다.
           */
          const failureCommands = this.getBlockCommandsById(
            input.blocks,
            block.on_failed,
          );

          buildCommands.push(`# Block: ${block.id} (with fallback)`);
          buildCommands.push(`if`);
          blockCommands.forEach((cmd) => buildCommands.push(`  ${cmd}`));
          buildCommands.push(`then`);
          buildCommands.push(`  echo "Block ${block.id} succeeded"`);

          if (block.on_success) {
            const nextCommands = this.getBlockCommandsById(
              input.blocks,
              block.on_success,
            );
            nextCommands.forEach((cmd) => buildCommands.push(`  ${cmd}`));
          }

          buildCommands.push(`else`);
          buildCommands.push(
            `  echo "Block ${block.id} failed, running fallback"`,
          );
          failureCommands.forEach((cmd) => buildCommands.push(`  ${cmd}`));
          buildCommands.push(`fi`);
        } else {
          // 단순 실행 (조건부 로직 없음 또는 패키지 매니저)
          buildCommands.push(`# Block: ${block.id}`);
          if (isPackageManagerBlock) {
            buildCommands.push(`# Package manager - fail fast on error`);
          }
          buildCommands.push(...blockCommands);
        }
      });

      if (buildCommands.length > 0) {
        buildSpec.phases.build = {
          commands: buildCommands,
          'on-failure': input.on_failure || 'ABORT',
        };
      }
    }

    // TEST 그룹 처리 (post_build 단계 초반부에 배치)
    // AWS 공식 문서에 따르면 테스트는 post_build에서 수행
    if (testBlocks.length > 0) {
      const testCommands: string[] = [];

      testBlocks.forEach((block) => {
        // 블록별 명령어 생성
        const blockCommands = this.getBlockCommandsById(input.blocks, block.id);

        // 테스트 블록은 실패시 fallback 허용 (테스트는 실패해도 다른 테스트 실행 가능)
        if (block.on_failed) {
          // 실패시 다른 블록 실행하는 조건부 로직
          const failureCommands = this.getBlockCommandsById(
            input.blocks,
            block.on_failed,
          );

          testCommands.push(`# Block: ${block.id} (with fallback)`);
          testCommands.push(`if`);
          blockCommands.forEach((cmd) => testCommands.push(`  ${cmd}`));
          testCommands.push(`then`);
          testCommands.push(`  echo "Test block ${block.id} succeeded"`);

          if (block.on_success) {
            const nextCommands = this.getBlockCommandsById(
              input.blocks,
              block.on_success,
            );
            nextCommands.forEach((cmd) => testCommands.push(`  ${cmd}`));
          }

          testCommands.push(`else`);
          testCommands.push(
            `  echo "Test block ${block.id} failed, running fallback"`,
          );
          failureCommands.forEach((cmd) => testCommands.push(`  ${cmd}`));
          testCommands.push(`fi`);
        } else {
          // 단순 실행 (조건부 로직 없음)
          testCommands.push(`# Test Block: ${block.id}`);
          testCommands.push(...blockCommands);
        }
      });

      if (testCommands.length > 0) {
        // 테스트는 실패해도 계속 진행 가능하도록 CONTINUE 옵션 사용
        buildSpec.phases.post_build = {
          commands: testCommands,
          'on-failure': 'CONTINUE',
        };
      }
    }

    // CUSTOM 그룹 처리 (pre_build 단계에서 실행 - AWS 공식 문서 권장사항)
    // pre_build는 빌드 준비 단계로 사용
    if (customBlocks.length > 0) {
      const customCommands: string[] = [];

      customBlocks.forEach((block) => {
        // 블록별 명령어 생성
        const blockCommands = this.getBlockCommandsById(input.blocks, block.id);

        // CUSTOM 그룹도 조건부 실행 지원
        if (block.on_failed) {
          // 실패시 다른 블록 실행하는 조건부 로직
          const failureCommands = this.getBlockCommandsById(
            input.blocks,
            block.on_failed,
          );

          customCommands.push(`# Custom Block: ${block.id} (with fallback)`);
          customCommands.push(`if`);
          blockCommands.forEach((cmd) => customCommands.push(`  ${cmd}`));
          customCommands.push(`then`);
          customCommands.push(`  echo "Custom block ${block.id} succeeded"`);

          if (block.on_success) {
            const nextCommands = this.getBlockCommandsById(
              input.blocks,
              block.on_success,
            );
            nextCommands.forEach((cmd) => customCommands.push(`  ${cmd}`));
          }

          customCommands.push(`else`);
          customCommands.push(
            `  echo "Custom block ${block.id} failed, running fallback"`,
          );
          failureCommands.forEach((cmd) => customCommands.push(`  ${cmd}`));
          customCommands.push(`fi`);
        } else {
          // 단순 실행 (조건부 로직 없음)
          customCommands.push(`# Custom Block: ${block.id}`);
          customCommands.push(...blockCommands);
        }
      });

      if (customCommands.length > 0) {
        buildSpec.phases.pre_build = {
          commands: customCommands,
          'on-failure': input.on_failure || 'ABORT',
        };
      }
    }

    /**
     * RUN 그룹 처리 - post_build phase 후반부에 배치
     *
     * AWS 공식 문서 권장사항에 따라 post_build는 빌드 후 작업에 사용합니다.
     * 배포, 아티팩트 업로드, 알림 전송 등의 작업을 수행합니다.
     * TEST 그룹 뒤에 배치되어 테스트 완료 후 실행됩니다.
     */
    if (runBlocks.length > 0) {
      const runCommands: string[] = [];

      runBlocks.forEach((block) => {
        // 블록별 명령어 생성
        const blockCommands = this.getBlockCommandsById(input.blocks, block.id);

        // RUN 그룹은 실패시 fallback 허용 (배포 실패시 다른 배포 방법 시도 가능)
        if (block.on_failed) {
          // 실패시 다른 블록 실행하는 조건부 로직
          const failureCommands = this.getBlockCommandsById(
            input.blocks,
            block.on_failed,
          );

          runCommands.push(`# Run Block: ${block.id} (with fallback)`);
          runCommands.push(`if`);
          blockCommands.forEach((cmd) => runCommands.push(`  ${cmd}`));
          runCommands.push(`then`);
          runCommands.push(`  echo "Run block ${block.id} succeeded"`);

          if (block.on_success) {
            const nextCommands = this.getBlockCommandsById(
              input.blocks,
              block.on_success,
            );
            nextCommands.forEach((cmd) => runCommands.push(`  ${cmd}`));
          }

          runCommands.push(`else`);
          runCommands.push(
            `  echo "Run block ${block.id} failed, running fallback"`,
          );
          failureCommands.forEach((cmd) => runCommands.push(`  ${cmd}`));
          runCommands.push(`fi`);
        } else {
          // 단순 실행 (조건부 로직 없음)
          runCommands.push(`# Run Block: ${block.id}`);
          runCommands.push(...blockCommands);
        }
      });

      // RUN 블록은 post_build 단계 마지막에 배치
      if (runCommands.length > 0) {
        if (!buildSpec.phases.post_build) {
          buildSpec.phases.post_build = {
            commands: [],
            'on-failure': 'CONTINUE',
          };
        }
        buildSpec.phases.post_build.commands = [
          ...(buildSpec.phases.post_build.commands || []),
          ...runCommands,
        ];
      }
    }

    /**
     * 아티팩트 설정 처리
     *
     * 빌드 결과물을 S3에 업로드하기 위한 설정
     * glob 패턴을 사용하여 파일을 선택할 수 있습니다.
     */
    if (input.artifacts && input.artifacts.length > 0) {
      buildSpec.artifacts = {
        files: input.artifacts,
      };
    }

    /**
     * 환경변수 및 시크릿 처리
     *
     * - environment_variables: 평문 환경 변수
     * - secrets: AWS Secrets Manager에서 가져오는 보안 값
     */
    if (
      (input.environment_variables &&
        Object.keys(input.environment_variables).length > 0) ||
      (input.secrets && Object.keys(input.secrets).length > 0)
    ) {
      buildSpec.env = {};

      if (
        input.environment_variables &&
        Object.keys(input.environment_variables).length > 0
      ) {
        buildSpec.env.variables = input.environment_variables;
      }

      if (input.secrets && Object.keys(input.secrets).length > 0) {
        buildSpec.env['secrets-manager'] = input.secrets;
      }
    }

    /**
     * 캐시 설정 처리
     *
     * 빌드 속도 향상을 위해 의존성 디렉토리를 캐싱
     * 예: node_modules, .npm, vendor 등
     */
    if (input.cache && input.cache.paths && input.cache.paths.length > 0) {
      buildSpec.cache = {
        paths: input.cache.paths,
      };
    }

    /**
     * 테스트 리포트 설정 처리
     *
     * JUnit, Cucumber 등의 테스트 결과를 AWS CodeBuild에 리포팅
     * CodeBuild 콘솔에서 테스트 결과를 시각화하여 볼 수 있습니다.
     */
    if (input.reports && Object.keys(input.reports).length > 0) {
      buildSpec.reports = {};
      Object.entries(input.reports).forEach(([reportName, reportConfig]) => {
        buildSpec.reports![reportName] = {
          files: reportConfig.files,
          ...(reportConfig['file-format'] && {
            'file-format': reportConfig['file-format'],
          }),
          ...(reportConfig['base-directory'] && {
            'base-directory': reportConfig['base-directory'],
          }),
          ...(reportConfig['discard-paths'] !== undefined && {
            'discard-paths': reportConfig['discard-paths'],
          }),
        };
      });
    }

    return yaml.dump(buildSpec, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });
  }

  /**
   * 지정된 CodeBuild 프로젝트에서 빌드를 시작합니다
   *
   * 사용자의 프로젝트 정보를 조회하고, AWS CodeBuild에서 빌드를 시작합니다.
   * 빌드 시작 후 빌드 이력을 데이터베이스에 저장합니다.
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param codebuildProjectName - AWS CodeBuild 프로젝트명
   * @param buildSpecOverride - buildspec.yml 내용 (YAML 문자열)
   * @param environmentVariables - 추가 환경변수 (선택사항)
   * @returns 빌드 시작 결과 (빌드 ID, 상태, CodeBuild 프로젝트명, 시작시간)
   * @throws {Error} 빌드 시작에 실패한 경우
   *
   * @example
   * ```typescript
   * const result = await codeBuildService.startBuild(
   *   'user-123',
   *   'proj-456',
   *   'codebuild-project-user123-proj456',
   *   'version: 0.2\nphases:\n  build:\n    commands:\n      - npm run build',
   *   { NODE_ENV: 'production' }
   * );
   * console.log(result.buildId); // 'build-789'
   * ```
   */
  async startBuild(
    userId: string,
    projectId: string,
    codebuildProjectName: string,
    buildSpecOverride: string,
    environmentVariables?: Record<string, string>,
    pipelineId?: string,
    pipelineData?: unknown,
  ) {
    try {
      const command = new StartBuildCommand({
        projectName: codebuildProjectName,
        buildspecOverride: buildSpecOverride,
        environmentVariablesOverride: environmentVariables
          ? Object.entries(environmentVariables).map(([name, value]) => ({
              name,
              value,
              type: 'PLAINTEXT',
            }))
          : undefined,
      });

      const response = await this.codeBuildClient.send(command);

      // 빌드 시작 이력을 데이터베이스에 저장
      if (response.build?.id) {
        try {
          // YAML 문자열을 객체로 파싱하여 저장 (buildSpec 타입이 object이므로)
          const buildSpecObject = yaml.load(buildSpecOverride) as object;
          await this.buildsService.saveBuildStart({
            userId,
            projectId,
            awsBuildId: response.build.id,
            buildSpec: buildSpecObject,
            environmentVariables,
            startTime: response.build.startTime,
            pipelineId,
            pipelineData,
          });
        } catch (error) {
          this.logger.warn(`Failed to save build history: ${String(error)}`);
          // 빌드 이력 저장 실패는 빌드 자체를 실패시키지 않음
        }
      }

      this.logger.log(
        `Build started: ${response.build?.id} for CodeBuild project ${codebuildProjectName} (user: ${userId})`,
      );

      return {
        buildId: response.build?.id || '',
        buildStatus: response.build?.buildStatus || '',
        codebuildProjectName:
          response.build?.projectName || codebuildProjectName,
        startTime: response.build?.startTime,
      };
    } catch (error) {
      this.logger.error(
        `Failed to start build for project ${projectId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 빌드 상태를 조회합니다
   *
   * AWS CodeBuild에서 빌드 상태를 조회하고, 데이터베이스의 빌드 이력을 업데이트합니다.
   * 빌드 단계별 정보도 함께 저장합니다.
   *
   * @param buildId - AWS CodeBuild 빌드 ID
   * @returns 빌드 상태 정보 (빌드 ID, 상태, CodeBuild 프로젝트명, 시간, 단계, 로그)
   * @throws {Error} 빌드를 찾을 수 없는 경우
   *
   * @example
   * ```typescript
   * const status = await codeBuildService.getBuildStatus('build-789');
   * console.log(status.buildStatus); // 'SUCCEEDED' 또는 'IN_PROGRESS'
   * console.log(status.phases); // 빌드 단계별 정보
   * ```
   */
  async getBuildStatus(buildId: string) {
    try {
      const command = new BatchGetBuildsCommand({
        ids: [buildId],
      });

      const response = await this.codeBuildClient.send(command);
      const build = response.builds?.[0];

      if (!build) {
        throw new Error(`Build with ID ${buildId} not found`);
      }

      // 빌드 상태를 데이터베이스에 업데이트
      if (build.id) {
        try {
          // 빌드 상태 업데이트
          await this.buildsService.updateBuildStatus(build.id, {
            buildExecutionStatus: this.mapAwsBuildStatusToOurStatus(
              build.buildStatus,
            ),
            endTime: build.endTime,
            durationSeconds: this.calculateBuildDuration(
              build.startTime,
              build.endTime,
            ),
            logsUrl: build.logs?.deepLink,
            buildErrorMessage:
              build.buildStatus === 'FAILED' ? 'Build failed' : undefined,
          });

          // 빌드 단계별 정보 저장
          if (build.phases && build.phases.length > 0) {
            await this.buildsService.saveBuildPhases(build.id, build.phases);
          }
        } catch (error) {
          this.logger.warn(`Failed to update build history: ${String(error)}`);
        }
      }

      return {
        buildId: build.id || '',
        buildStatus: build.buildStatus || '',
        codebuildProjectName: build.projectName || '',
        startTime: build.startTime,
        endTime: build.endTime,
        currentPhase: build.currentPhase,
        phases: build.phases,
        logs: build.logs,
      };
    } catch (error) {
      this.logger.error(`Failed to get build status for ${buildId}:`, error);
      throw error;
    }
  }

  /**
   * FlowBlock 기반 파이프라인으로 빌드를 시작합니다
   *
   * FlowBlock 배열을 받아서 AWS CodeBuild buildspec.yml로 변환한 후 빌드를 시작합니다.
   * 이 메서드는 사용자 친화적인 블록 기반 형식을 AWS 표준 형식으로 변환합니다.
   * CodeBuild 프로젝트명은 projectId를 기반으로 자동 생성됩니다.
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param input - FlowBlock 기반 파이프라인 설정
   * @param environmentVariables - 추가 환경변수 (선택사항)
   * @returns 빌드 시작 결과 (빌드 ID, 상태, CodeBuild 프로젝트명, 시작시간)
   * @throws {Error} 빌드 시작에 실패한 경우
   *
   * @example
   * ```typescript
   * const result = await codeBuildService.startFlowBuild('user-123', 'proj-456', {
   *   version: "0.2",
   *   runtime: "node:18",
   *   blocks: [
   *     {
   *       id: "install-deps",
   *       block_type: "node_package_manager",
   *       group_type: "build",
   *       on_success: "build-app",
   *       package_manager: "npm",
   *       package_list: []
   *     },
   *     {
   *       id: "build-app",
   *       block_type: "custom_build_command",
   *       group_type: "build",
   *       on_success: "test-app",
   *       custom_command: ["npm run build"]
   *     }
   *   ],
   *   artifacts: ["dist/**"],
   *   environment_variables: {
   *     NODE_ENV: 'production'
   *   }
   * });
   * console.log(result.buildId); // 'build-789'
   * ```
   */
  async startFlowBuild(
    userId: string,
    projectId: string,
    input: FlowPipelineInput,
    environmentVariables?: Record<string, string>,
    pipelineId?: string,
  ) {
    // FlowBlock을 buildspec.yml로 변환
    const buildSpecYaml = this.convertFlowPipelineToBuildSpec(input);

    this.logger.log(
      `Generated buildspec.yml for FlowBlock pipeline ${projectId}:`,
      buildSpecYaml,
    );

    // projectId를 기반으로 AWS CodeBuild 프로젝트명 생성
    const codebuildProjectName = `otto-${userId}-${projectId}`;

    // 파이프라인 ID가 없는 경우, 프로젝트의 기본 파이프라인 조회
    let activePipelineId = pipelineId;
    let pipelineData: unknown = null;

    if (!activePipelineId) {
      try {
        // 프로젝트의 활성 파이프라인 조회
        const { data: pipeline } = await this.supabaseService
          .getClient()
          .from('pipeline')
          .select('id, blocks, artifacts, environment_variables, cache')
          .eq('project_id', projectId)
          .single();

        if (pipeline) {
          activePipelineId = pipeline.id;
          // 파이프라인 데이터 스냅샷 저장
          pipelineData = {
            blocks: pipeline.blocks,
            artifacts: pipeline.artifacts,
            environment_variables: pipeline.environment_variables,
            cache: pipeline.cache,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to retrieve pipeline for project ${projectId}: ${String(error)}`,
        );
      }
    }

    // 동적으로 생성된 CodeBuild 프로젝트명으로 빌드 시작
    return this.startBuild(
      userId,
      projectId,
      codebuildProjectName,
      buildSpecYaml,
      environmentVariables,
      activePipelineId,
      pipelineData,
    );
  }

  /**
   * AWS CodeBuild 상태를 우리 시스템의 상태로 매핑합니다
   *
   * @private
   * @param awsStatus - AWS CodeBuild 상태
   * @returns 매핑된 빌드 상태
   */
  private mapAwsBuildStatusToOurStatus(
    awsStatus?: string,
  ):
    | 'pending'
    | 'in_progress'
    | 'succeeded'
    | 'failed'
    | 'stopped'
    | 'timed_out'
    | 'fault' {
    switch (awsStatus) {
      case 'SUCCEEDED':
        return 'succeeded';
      case 'FAILED':
        return 'failed';
      case 'FAULT':
        return 'fault';
      case 'TIMED_OUT':
        return 'timed_out';
      case 'IN_PROGRESS':
        return 'in_progress';
      case 'STOPPED':
        return 'stopped';
      default:
        return 'pending';
    }
  }

  /**
   * CodeBuild 프로젝트를 생성합니다
   *
   * 프로젝트 생성 시 자동으로 AWS CodeBuild 프로젝트를 생성합니다.
   * 고정된 템플릿을 사용하여 일관된 설정으로 프로젝트를 생성합니다.
   *
   * @param userId - 사용자 ID
   * @param projectName - 프로젝트 이름
   * @param githubRepoUrl - GitHub 저장소 URL
   * @param selectedBranch - 선택된 브랜치
   * @returns CodeBuild 프로젝트 생성 결과
   * @throws {Error} CodeBuild 프로젝트 생성에 실패한 경우
   *
   * @example
   * ```typescript
   * const result = await codeBuildService.createCodeBuildProject(
   *   'user-123',
   *   'my-project',
   *   'https://github.com/user/repo',
   *   'main'
   * );
   * console.log(result.projectName); // 'otto-my-project-user-123'
   * ```
   */
  async createCodeBuildProject(
    userId: string,
    projectName: string,
    githubRepoUrl: string,
    selectedBranch: string,
  ): Promise<{
    projectName: string;
    projectArn: string;
    logGroupName: string;
  }> {
    try {
      this.logger.log(`[CodeBuildService] createCodeBuildProject 시작:`, {
        userId,
        projectName,
        githubRepoUrl,
        selectedBranch,
      });

      // 프로젝트명 정리 (특수문자 제거)
      const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9-]/g, '-');
      const codebuildProjectName = `otto-${sanitizedProjectName}-${userId}`;
      const logGroupName = `otto-${sanitizedProjectName}-${userId}-cloudwatch`;
      const artifactsName = `otto-${sanitizedProjectName}-${userId}-artifacts`;

      this.logger.log(`[CodeBuildService] 프로젝트명 생성:`, {
        sanitizedProjectName,
        codebuildProjectName,
        logGroupName,
        artifactsName,
      });

      // AWS 설정
      const region =
        this.configService.get<string>('AWS_REGION') || 'ap-northeast-2';
      const codebuildServiceRole = this.configService.get<string>(
        'AWS_CODEBUILD_SERVICE_ROLE',
      );
      const codebuildArtifactsBucket = this.configService.get<string>(
        'CODEBUILD_ARTIFACTS_BUCKET',
      );

      this.logger.log(`[CodeBuildService] AWS 설정 확인:`, {
        region,
        codebuildServiceRole: codebuildServiceRole
          ? `${codebuildServiceRole.substring(0, 20)}...`
          : '누락',
        codebuildArtifactsBucket: codebuildArtifactsBucket
          ? `${codebuildArtifactsBucket.substring(0, 20)}...`
          : '누락',
      });

      if (!codebuildServiceRole || !codebuildArtifactsBucket) {
        throw new Error(
          'AWS CodeBuild 설정이 누락되었습니다: AWS_CODEBUILD_SERVICE_ROLE, CODEBUILD_ARTIFACTS_BUCKET',
        );
      }

      // 기본 buildspec 생성
      const buildspec = this.createDefaultBuildspec();

      const createProjectCommand = new CreateProjectCommand({
        name: codebuildProjectName,
        source: {
          type: 'GITHUB',
          location: githubRepoUrl,
          buildspec: buildspec,
          // GitHub App 인증 없이 사용 가능
        },
        sourceVersion: `refs/heads/${selectedBranch}`,
        artifacts: {
          type: 'S3',
          location: codebuildArtifactsBucket,
          name: artifactsName,
          packaging: 'ZIP',
        },
        environment: {
          type: 'LINUX_CONTAINER',
          image: 'aws/codebuild/standard:7.0',
          computeType: 'BUILD_GENERAL1_MEDIUM',
        },
        serviceRole: codebuildServiceRole,
        timeoutInMinutes: 60,
        logsConfig: {
          cloudWatchLogs: {
            status: 'ENABLED',
            groupName: logGroupName,
          },
        },
      });

      this.logger.log(`[CodeBuildService] CreateProjectCommand 생성 완료:`, {
        projectName: codebuildProjectName,
        githubRepoUrl,
        selectedBranch,
        serviceRole: codebuildServiceRole,
        region,
      });

      this.logger.log(`[CodeBuildService] AWS CodeBuild API 호출 시작...`);

      const createProjectResult =
        await this.codeBuildClient.send(createProjectCommand);

      this.logger.log(`[CodeBuildService] AWS CodeBuild API 호출 성공:`, {
        projectArn: createProjectResult.project?.arn,
        projectName: createProjectResult.project?.name,
      });

      if (
        !createProjectResult.project?.arn ||
        !createProjectResult.project?.name
      ) {
        throw new Error(
          'CodeBuild 프로젝트 생성 실패: 프로젝트 정보가 누락되었습니다',
        );
      }

      this.logger.log(
        `CodeBuild 프로젝트 생성 완료: ${createProjectResult.project.name} (ARN: ${createProjectResult.project.arn})`,
      );

      return {
        projectName: createProjectResult.project.name,
        projectArn: createProjectResult.project.arn,
        logGroupName,
      };
    } catch (error) {
      this.logger.error(`CodeBuild 프로젝트 생성 실패: ${projectName}`, error);
      throw error;
    }
  }

  /**
   * 기본 buildspec.yml을 생성합니다
   *
   * @private
   * @returns 기본 buildspec.yml 문자열
   */
  private createDefaultBuildspec(): string {
    return `version: 0.2
phases:
  pre_build:
    commands:
      - echo Installing dependencies...
      - npm install || yarn install || echo "No package manager found"
  build:
    commands:
      - echo Build started
      - npm run build || yarn build || echo "No build script found"
  post_build:
    commands:
      - echo Build completed
artifacts:
  files:
    - '**/*'
  base-directory: '.'
`;
  }

  /**
   * 빌드 시작/종료 시간으로부터 지속시간을 계산합니다
   *
   * @private
   * @param startTime - 시작 시간
   * @param endTime - 종료 시간
   * @returns 지속시간(초) 또는 undefined
   */
  private calculateBuildDuration(
    startTime?: Date,
    endTime?: Date,
  ): number | undefined {
    if (!startTime || !endTime) return undefined;
    return Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  }

  /**
   * 블록 ID로 해당 블록의 명령어들을 가져옵니다
   * 블록의 on_success/on_failed 체인을 재귀적으로 처리하지 않고,
   * 단일 블록의 명령어만 반환합니다.
   *
   * @private
   * @param blocks - 모든 블록 배열
   * @param blockId - 찾을 블록 ID
   * @returns 해당 블록의 명령어 배열
   */
  private getBlockCommandsById(
    blocks: FlowBlockUnion[],
    blockId: string,
  ): string[] {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return [];

    // 블록 타입별로 적절한 명령어 생성
    switch (block.block_type) {
      /**
       * OS 패키지 매니저 처리
       *
       * apt-get, yum, brew 등의 시스템 패키지 매니저 명령어 생성
       * apt-get의 경우 패키지 설치 전 update 필수
       */
      case BlockTypeEnum.OS_PACKAGE_MANAGER: {
        const osBlock = block;
        if (osBlock.package_list && osBlock.package_list.length > 0) {
          // 패키지 목록이 있는 경우 설치 명령어 생성
          const commands: string[] = [];

          // apt 계열은 패키지 목록 업데이트 필요
          if (
            osBlock.package_manager === 'apt-get' ||
            osBlock.package_manager === 'apt'
          ) {
            commands.push('apt-get update -y');
          }

          // 패키지 설치 명령어 추가
          commands.push(
            `${osBlock.package_manager} install -y ${osBlock.package_list.join(' ')}`,
          );
          return commands;
        } else {
          // 패키지 목록이 없으면 update만 실행
          return [`${osBlock.package_manager} update -y`];
        }
      }

      /**
       * Node.js 패키지 매니저 처리
       *
       * npm, yarn, pnpm 등의 Node.js 패키지 매니저 명령어 생성
       */
      case BlockTypeEnum.NODE_PACKAGE_MANAGER: {
        const nodeBlock = block;
        if (nodeBlock.package_list && nodeBlock.package_list.length > 0) {
          // 특정 패키지 설치
          return [
            `${nodeBlock.package_manager} install ${nodeBlock.package_list.join(' ')}`,
          ];
        } else {
          // package.json에 정의된 모든 의존성 설치
          return [`${nodeBlock.package_manager} install`];
        }
      }

      /**
       * 커스텀 빌드 명령어
       * 사용자가 직접 정의한 빌드 명령어 반환
       */
      case BlockTypeEnum.CUSTOM_BUILD_COMMAND: {
        const buildBlock = block;
        return buildBlock.custom_command || [];
      }

      /**
       * Node.js 테스트 명령어
       * npm test, yarn test 등의 테스트 명령어 반환
       */
      case BlockTypeEnum.NODE_TEST_COMMAND: {
        const testBlock = block;
        return testBlock.test_command || [];
      }

      /**
       * 커스텀 테스트 명령어
       * 사용자가 직접 정의한 테스트 명령어 반환
       */
      case BlockTypeEnum.CUSTOM_TEST_COMMAND: {
        const customTestBlock = block;
        return customTestBlock.custom_command || [];
      }

      /**
       * 커스텀 실행 명령어
       * 배포, 알림 등 사용자 정의 실행 명령어 반환
       */
      case BlockTypeEnum.CUSTOM_RUN_COMMAND: {
        const runBlock = block;
        return runBlock.custom_command || [];
      }

      default:
        return [];
    }
  }
}
