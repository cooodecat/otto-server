import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
} from '@aws-sdk/client-codebuild';
import * as yaml from 'js-yaml';
import { ProjectsService } from '../projects/projects.service';

/**
 * buildspec.yml 입력 인터페이스
 */
export interface BuildSpecInput {
  version?: string;
  runtime?: string;
  commands: {
    install?: string[];
    pre_build?: string[];
    build?: string[];
    post_build?: string[];
    finally?: string[];
  };
  artifacts?: string[];
  environment_variables?: Record<string, string>;
  cache?: {
    paths?: string[];
  };
  reports?: Record<
    string,
    {
      files: string[];
      'file-format'?:
        | 'JUNITXML'
        | 'CUCUMBERJSON'
        | 'TESTNGXML'
        | 'CLOVERXML'
        | 'VISUALSTUDIOTRX'
        | 'JACOCOXML'
        | 'NUNITXML'
        | 'NUNIT3XML';
      'base-directory'?: string;
      'discard-paths'?: boolean;
    }
  >;
  on_failure?: 'ABORT' | 'CONTINUE';
  secrets?: Record<string, string>;
}

/**
 * AWS CodeBuild buildspec.yml 형식 인터페이스
 */
export interface BuildSpecYaml {
  version: string;
  phases: {
    install?: {
      'runtime-versions'?: Record<string, string>;
      commands?: string[];
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    pre_build?: {
      commands?: string[];
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    build?: {
      commands?: string[];
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    post_build?: {
      commands?: string[];
      'on-failure'?: 'ABORT' | 'CONTINUE';
    };
    finally?: {
      commands?: string[];
    };
  };
  artifacts?: {
    files: string[];
  };
  env?: {
    variables?: Record<string, string>;
    'secrets-manager'?: Record<string, string>;
  };
  cache?: {
    paths?: string[];
  };
  reports?: Record<
    string,
    {
      files: string[];
      'file-format'?: string;
      'base-directory'?: string;
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
   * @param projectsService - 프로젝트 관리 서비스
   * @throws {Error} AWS 자격 증명이 누락된 경우
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
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
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param buildSpecOverride - buildspec.yml 내용
   * @param environmentVariables - 추가 환경변수
   * @returns 빌드 시작 결과
   * @throws {Error} 프로젝트를 찾을 수 없거나 빌드 시작에 실패한 경우
   */
  async startBuild(
    userId: string,
    projectId: string,
    buildSpecOverride: string,
    environmentVariables?: Record<string, string>,
  ) {
    try {
      // 사용자의 프로젝트 정보 조회
      const project = await this.projectsService.getProject(userId, projectId);

      const command = new StartBuildCommand({
        projectName: project.codebuildProjectName,
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

      this.logger.log(
        `Build started: ${response.build?.id} for project ${project.codebuildProjectName} (user: ${userId})`
      );

      return {
        buildId: response.build?.id || '',
        buildStatus: response.build?.buildStatus || '',
        projectName: response.build?.projectName || '',
        startTime: response.build?.startTime,
      };
    } catch (error) {
      this.logger.error(`Failed to start build for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * 빌드 상태를 조회합니다
   *
   * @param buildId - 빌드 ID
   * @returns 빌드 상태 정보
   * @throws {Error} 빌드를 찾을 수 없는 경우
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
   * JSON 설정을 buildspec.yml로 변환한 후 빌드를 시작합니다.
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param input - JSON 형태의 빌드 설정
   * @param environmentVariables - 추가 환경변수
   * @returns 빌드 시작 결과
   *
   * @example
   * ```typescript
   * const result = await startBuildFromJson('user-123', 'proj-456', {
   *   runtime: 'node:18',
   *   commands: {
   *     install: ['npm ci'],
   *     build: ['npm run build']
   *   }
   * });
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

    this.logger.log(`Generated buildspec.yml for project ${projectId}:`, buildSpecYaml);

    // 동적으로 선택된 프로젝트에서 빌드 시작
    return this.startBuild(userId, projectId, buildSpecYaml, environmentVariables);
  }
}