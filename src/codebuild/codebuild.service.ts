import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
} from '@aws-sdk/client-codebuild';
import * as yaml from 'js-yaml';
import { BuildsService } from '../builds/builds.service';

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
   * JSON 형태의 빌드 설정을 AWS CodeBuild buildspec.yml로 변환합니다
   *
   * @param input - JSON 형태의 빌드 설정
   * @returns YAML 형식의 buildspec 문자열
   *
   * @example
   * ```typescript
   * const buildSpec = convertJsonToBuildSpec({
   *   runtime: 'node:18',
   *   commands: {
   *     build: ['npm run build']
   *   }
   * });
   * ```
   */
  convertJsonToBuildSpec(input: BuildSpecInput): string {
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

    // 빌드 단계별 명령어 처리
    Object.entries(input.commands).forEach(([phase, commands]) => {
      if (commands && commands.length > 0) {
        if (phase === 'install' && buildSpec.phases.install) {
          buildSpec.phases.install.commands = commands;
        } else if (phase === 'finally') {
          buildSpec.phases.finally = {
            commands,
          };
        } else {
          buildSpec.phases[phase] = {
            commands,
          };
        }

        // finally 단계를 제외한 단계에 실패 처리 추가
        if (input.on_failure && phase !== 'finally') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (buildSpec.phases[phase] as any)['on-failure'] = input.on_failure;
        }
      }
    });

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
   * JSON 형태의 빌드 설정으로 빌드를 시작합니다
   *
   * JSON 설정을 AWS CodeBuild buildspec.yml로 변환한 후 빌드를 시작합니다.
   * 이 메서드는 사용자 친화적인 JSON 형식을 AWS 표준 형식으로 변환합니다.
   * 프로젝트명은 projectId를 기반으로 자동 생성됩니다.
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param input - JSON 형태의 빌드 설정
   * @param environmentVariables - 추가 환경변수 (선택사항)
   * @returns 빌드 시작 결과 (빌드 ID, 상태, 프로젝트명, 시작시간)
   * @throws {Error} 빌드 시작에 실패한 경우
   *
   * @example
   * ```typescript
   * const result = await codeBuildService.startBuildFromJson('user-123', 'proj-456', {
   *   runtime: 'node:18',
   *   commands: {
   *     install: ['npm ci'],
   *     build: ['npm run build']
   *   },
   *   artifacts: ['dist/*'],
   *   environment_variables: {
   *     NODE_ENV: 'production'
   *   }
   * });
   * console.log(result.buildId); // 'build-789'
   * ```
   */
  async startBuildFromJson(
    userId: string,
    projectId: string,
    input: BuildSpecInput,
    environmentVariables?: Record<string, string>,
  ) {
    // JSON을 buildspec.yml로 변환
    const buildSpecYaml = this.convertJsonToBuildSpec(input);

    this.logger.log(
      `Generated buildspec.yml for project ${projectId}:`,
      buildSpecYaml,
    );

    // projectId를 기반으로 AWS CodeBuild 프로젝트명 생성
    // 일반적으로 otto-{userId}-{projectId} 형식을 사용
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
}
