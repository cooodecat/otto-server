import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
} from '@aws-sdk/client-codebuild';
import * as yaml from 'js-yaml';
import { BuildsService } from '../builds/builds.service';
import {
  FlowPipelineInput,
  BlockTypeEnum,
  BlockGroupType,
} from './types/flow-block.types';

/**
 * AWS CodeBuild buildspec.yml 형식 인터페이스
 * AWS CodeBuild에서 사용하는 표준 buildspec.yml 구조
 */
export interface BuildSpecYaml {
  /** buildspec 버전 */
  version: string;
  /** 빌드 단계별 설정 */
  phases: {
    /** 설치 단계 */
    install?: {
      /** 런타임 버전 설정 */
      'runtime-versions'?: Record<string, string>;
      /** 설치 명령어 */
      commands?: string[];
      /** 실패 시 동작 */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /** 빌드 전 단계 */
    pre_build?: {
      /** 빌드 전 명령어 */
      commands?: string[];
      /** 실패 시 동작 */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /** 빌드 단계 */
    build?: {
      /** 빌드 명령어 */
      commands?: string[];
      /** 실패 시 동작 */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /** 빌드 후 단계 */
    post_build?: {
      /** 빌드 후 명령어 */
      commands?: string[];
      /** 실패 시 동작 */
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    /** 최종 단계 */
    finally?: {
      /** 최종 명령어 */
      commands?: string[];
    };
  };
  /** 아티팩트 설정 */
  artifacts?: {
    /** 아티팩트 파일 목록 */
    files: string[];
  };
  /** 환경 설정 */
  env?: {
    /** 환경 변수 */
    variables?: Record<string, string>;
    /** AWS Secrets Manager 시크릿 */
    'secrets-manager'?: Record<string, string>;
  };
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
   * 더 이상 고정된 프로젝트명을 사용하지 않고, 런타임에 동적으로 결정합니다.
   *
   * @param configService - 환경 설정 서비스
   * @param buildsService - 빌드 이력 관리 서비스
   * @throws {Error} AWS 자격 증명이 누락된 경우
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly buildsService: BuildsService,
  ) {
    // AWS 설정 로드
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    // AWS 자격 증명 검증
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials are required: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
      );
    }

    // CodeBuild 클라이언트 초기화
    this.codeBuildClient = new CodeBuildClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * FlowBlock 기반 파이프라인을 AWS CodeBuild buildspec.yml로 변환합니다
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

    // 블록들을 그룹별로 분류 (순서 유지)
    const buildBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.BUILD || block.group_type === 'build',
    );
    const testBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.TEST || block.group_type === 'test',
    );
    const runBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.RUN || block.group_type === 'run',
    );
    const customBlocks = input.blocks.filter(
      (block) => block.group_type === BlockGroupType.CUSTOM || block.group_type === 'custom',
    );

    // BUILD 그룹 처리 (조건부 실행 지원)
    if (buildBlocks.length > 0) {
      const buildCommands: string[] = [];

      buildBlocks.forEach((block) => {
        // 블록별 명령어 생성
        const blockCommands = this.getBlockCommandsById(input.blocks, block.id);

        // 패키지 매니저 블록은 실패시 중단 (fallback 불가)
        const isPackageManagerBlock =
          block.block_type === BlockTypeEnum.OS_PACKAGE_MANAGER ||
          block.block_type === BlockTypeEnum.NODE_PACKAGE_MANAGER;
        if (block.on_failed && !isPackageManagerBlock) {
          // 실패시 다른 블록 실행하는 조건부 로직 (패키지 매니저 제외)
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

    // RUN 그룹 처리 (post_build 단계에 배치 - AWS 공식 문서 권장사항)
    // post_build는 빌드 후 작업 및 아티팩트 처리에 사용
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
          buildSpec.phases.post_build = { commands: [], 'on-failure': 'CONTINUE' };
        }
        buildSpec.phases.post_build.commands = [
          ...(buildSpec.phases.post_build.commands || []),
          ...runCommands,
        ];
      }
    }

    // 아티팩트 설정 처리
    if (input.artifacts && input.artifacts.length > 0) {
      buildSpec.artifacts = {
        files: input.artifacts,
      };
    }

    // 환경변수 및 시크릿 처리
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

    // 캐시 설정 처리
    if (input.cache && input.cache.paths && input.cache.paths.length > 0) {
      buildSpec.cache = {
        paths: input.cache.paths,
      };
    }

    // 리포트 설정 처리
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
   * @param projectName - AWS CodeBuild 프로젝트명
   * @param buildSpecOverride - buildspec.yml 내용 (YAML 문자열)
   * @param environmentVariables - 추가 환경변수 (선택사항)
   * @returns 빌드 시작 결과 (빌드 ID, 상태, 프로젝트명, 시작시간)
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
    projectName: string,
    buildSpecOverride: string,
    environmentVariables?: Record<string, string>,
  ) {
    try {
      const command = new StartBuildCommand({
        projectName: projectName,
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
          });
        } catch (error) {
          this.logger.warn(`Failed to save build history: ${String(error)}`);
          // 빌드 이력 저장 실패는 빌드 자체를 실패시키지 않음
        }
      }

      this.logger.log(
        `Build started: ${response.build?.id} for project ${projectName} (user: ${userId})`,
      );

      return {
        buildId: response.build?.id || '',
        buildStatus: response.build?.buildStatus || '',
        projectName: response.build?.projectName || '',
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
   * @returns 빌드 상태 정보 (빌드 ID, 상태, 프로젝트명, 시간, 단계, 로그)
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
        projectName: build.projectName || '',
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
   * 프로젝트명은 projectId를 기반으로 자동 생성됩니다.
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param input - FlowBlock 기반 파이프라인 설정
   * @param environmentVariables - 추가 환경변수 (선택사항)
   * @returns 빌드 시작 결과 (빌드 ID, 상태, 프로젝트명, 시작시간)
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
  ) {
    // FlowBlock을 buildspec.yml로 변환
    const buildSpecYaml = this.convertFlowPipelineToBuildSpec(input);

    this.logger.log(
      `Generated buildspec.yml for FlowBlock pipeline ${projectId}:`,
      buildSpecYaml,
    );

    // projectId를 기반으로 AWS CodeBuild 프로젝트명 생성
    const projectName = `otto-${userId}-${projectId}`;

    // 동적으로 생성된 프로젝트명으로 빌드 시작
    return this.startBuild(
      userId,
      projectId,
      projectName,
      buildSpecYaml,
      environmentVariables,
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
  private getBlockCommandsById(blocks: any[], blockId: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return [];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    switch (block.block_type) {
      case BlockTypeEnum.OS_PACKAGE_MANAGER:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (block.package_list && block.package_list.length > 0) {
          // apt-get의 경우 update를 먼저 실행
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const commands = [];
          if (block.package_manager === 'apt-get' || block.package_manager === 'apt') {
            commands.push('apt-get update -y');
          }
          commands.push(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            `${block.package_manager} install -y ${block.package_list.join(' ')}`,
          );
          return commands;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return [`${block.package_manager} update -y`];
        }

      case BlockTypeEnum.NODE_PACKAGE_MANAGER:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (block.package_list && block.package_list.length > 0) {
          return [
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            `${block.package_manager} install ${block.package_list.join(' ')}`,
          ];
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return [`${block.package_manager} install`];
        }

      case BlockTypeEnum.CUSTOM_BUILD_COMMAND:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return block.custom_command || [];

      case BlockTypeEnum.NODE_TEST_COMMAND:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return block.test_command || [];

      case BlockTypeEnum.CUSTOM_TEST_COMMAND:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return block.custom_command || [];

      case BlockTypeEnum.CUSTOM_RUN_COMMAND:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return block.custom_command || [];

      default:
        return [];
    }
  }
}
