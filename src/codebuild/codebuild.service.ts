import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
  BatchGetProjectsCommand,
  CreateProjectCommand,
  UpdateProjectCommand,
  DeleteProjectCommand,
  ListProjectsCommand,
} from '@aws-sdk/client-codebuild';
import * as yaml from 'js-yaml';
import { BuildsService } from '../builds/builds.service';
import { SupabaseService } from '../supabase/supabase.service';

import {
  SimplePipelineInput,
  AnyPipelineBlock,
  CICDBlockType,
  CICDBlockGroup,
} from './types/pipeline-input.types';

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

    // AWS 자격 증명 검증
    this.logger.log(`[CodeBuildService] AWS 자격 증명 확인:`, {
      region,
      accessKeyId: accessKeyId ? `${accessKeyId.substring(0, 10)}...` : '누락',
      secretAccessKey: secretAccessKey
        ? `${secretAccessKey.substring(0, 10)}...`
        : '누락',
    });

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials are required: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
      );
    }

    this.logger.log(`[CodeBuildService] CodeBuild 클라이언트 초기화:`, {
      region,
      credentialType: 'Permanent',
    });

    this.codeBuildClient = new CodeBuildClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * camelCase Pipeline Input을 buildspec.yml로 변환합니다
   *
   * @description
   * otto-ui에서 전송하는 camelCase 형태의 파이프라인 데이터를
   * AWS CodeBuild가 이해할 수 있는 buildspec.yml 형식으로 변환합니다.
   *
   * @param input - camelCase 형태의 파이프라인 입력
   * @returns buildspec.yml YAML 문자열
   */
  convertPipelineInputToBuildSpec(input: SimplePipelineInput): string {
    // 블록에서 version과 runtime 추출
    const versionAndRuntime = this.extractVersionAndRuntimeFromBlocks(
      input.blocks,
    );

    const buildSpec: BuildSpecYaml = {
      version: versionAndRuntime.version || '0.2',
      phases: {},
    };

    // 런타임 설정 처리
    if (versionAndRuntime.runtime) {
      const runtimeParts = versionAndRuntime.runtime.includes(':')
        ? versionAndRuntime.runtime.split(':')
        : [versionAndRuntime.runtime, 'latest'];
      const [runtimeName, version] = runtimeParts;

      buildSpec.phases.install = {
        'runtime-versions': {
          [runtimeName]: version,
        },
      };
    }

    // 블록들을 그룹별로 분류
    const startBlocks = input.blocks.filter(
      (block) => block.groupType === CICDBlockGroup.START,
    );
    const prebuildBlocks = input.blocks.filter(
      (block) => block.groupType === CICDBlockGroup.PREBUILD,
    );
    const buildBlocks = input.blocks.filter(
      (block) => block.groupType === CICDBlockGroup.BUILD,
    );
    const testBlocks = input.blocks.filter(
      (block) => block.groupType === CICDBlockGroup.TEST,
    );
    const notificationBlocks = input.blocks.filter(
      (block) => block.groupType === CICDBlockGroup.NOTIFICATION,
    );
    const utilityBlocks = input.blocks.filter(
      (block) => block.groupType === CICDBlockGroup.UTILITY,
    );

    // 모든 블록에서 환경변수 수집
    const allEnvironmentVariables = this.collectEnvironmentVariablesFromBlocks(
      input.blocks,
    );

    // pre_build 단계: PREBUILD 그룹 처리
    if (prebuildBlocks.length > 0) {
      buildSpec.phases.pre_build = {
        commands: [],
      };

      for (const block of prebuildBlocks) {
        const commands = this.convertCICDBlockToCommands(block);
        buildSpec.phases.pre_build.commands!.push(...commands);
      }
    }

    // build 단계: BUILD 그룹 처리
    if (buildBlocks.length > 0) {
      buildSpec.phases.build = {
        commands: [],
      };

      for (const block of buildBlocks) {
        const commands = this.convertCICDBlockToCommands(block);
        buildSpec.phases.build.commands!.push(...commands);
      }
    }

    // post_build 단계: TEST, NOTIFICATION, UTILITY 그룹 처리
    const postBuildBlocks = [
      ...testBlocks,
      ...notificationBlocks,
      ...utilityBlocks,
    ];
    if (postBuildBlocks.length > 0) {
      buildSpec.phases.post_build = {
        commands: [],
      };

      for (const block of postBuildBlocks) {
        const commands = this.convertCICDBlockToCommands(block);
        buildSpec.phases.post_build.commands!.push(...commands);
      }
    }

    // 블록에서 수집된 환경변수 처리
    if (Object.keys(allEnvironmentVariables).length > 0) {
      buildSpec.env = {
        variables: allEnvironmentVariables,
      };
    }

    return yaml.dump(buildSpec, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });
  }

  /**
   * 블록에서 version과 runtime을 추출합니다
   */
  private extractVersionAndRuntimeFromBlocks(blocks: AnyPipelineBlock[]): {
    version?: string;
    runtime?: string;
  } {
    let version: string | undefined;
    let runtime: string | undefined;

    for (const block of blocks) {
      // Pipeline Start 블록에서 version 정보 추출
      if (block.blockType === CICDBlockType.PIPELINE_START) {
        const startBlock = block as any;
        if (startBlock.version) {
          version = startBlock.version;
        }
      }

      // Node Version 블록에서 runtime 정보 추출
      if (block.blockType === CICDBlockType.NODE_VERSION) {
        const nodeBlock = block as any;
        if (nodeBlock.version) {
          runtime = `node:${nodeBlock.version}`;
        }
      }

      // 범용적으로 version, runtime 속성이 있는 블록에서 추출
      const anyBlock = block as any;
      if (anyBlock.version && !version) {
        version = anyBlock.version;
      }
      if (anyBlock.runtime && !runtime) {
        runtime = anyBlock.runtime;
      }
    }

    return { version, runtime };
  }

  /**
   * 모든 블록에서 환경변수를 수집합니다
   */
  private collectEnvironmentVariablesFromBlocks(
    blocks: AnyPipelineBlock[],
  ): Record<string, string> {
    const allEnvVars: Record<string, string> = {};

    for (const block of blocks) {
      // Environment Setup 블록에서 환경변수 추출
      if (block.blockType === CICDBlockType.ENVIRONMENT_SETUP) {
        const envBlock = block as any;
        if (envBlock.environmentVariables) {
          Object.assign(allEnvVars, envBlock.environmentVariables);
        }
      }

      // Custom Command 블록에서 환경변수 추출
      if (block.blockType === CICDBlockType.CUSTOM_COMMAND) {
        const customBlock = block as any;
        if (customBlock.environmentVariables) {
          Object.assign(allEnvVars, customBlock.environmentVariables);
        }
      }

      // 다른 블록들도 환경변수가 있을 수 있으므로 범용적으로 처리
      const anyBlock = block as any;
      if (
        anyBlock.environmentVariables &&
        typeof anyBlock.environmentVariables === 'object'
      ) {
        Object.assign(allEnvVars, anyBlock.environmentVariables);
      }
    }

    return allEnvVars;
  }

  /**
   * CICD 블록을 buildspec 명령어로 변환합니다
   */
  private convertCICDBlockToCommands(block: AnyPipelineBlock): string[] {
    switch (block.blockType) {
      // OS Package 설치
      case CICDBlockType.OS_PACKAGE: {
        const osBlock = block as any;
        const packages = osBlock.installPackages?.join(' ') || '';
        switch (osBlock.packageManager) {
          case 'apt':
            return osBlock.updatePackageList
              ? [`apt-get update`, `apt-get install -y ${packages}`]
              : [`apt-get install -y ${packages}`];
          case 'yum':
            return [`yum install -y ${packages}`];
          case 'brew':
            return [`brew install ${packages}`];
          default:
            return [`${osBlock.packageManager} install ${packages}`];
        }
      }

      // Node.js 버전 설정
      case CICDBlockType.NODE_VERSION: {
        const nodeBlock = block as any;
        return [
          `nvm install ${nodeBlock.version}`,
          `nvm use ${nodeBlock.version}`,
          `npm install -g ${nodeBlock.packageManager || 'npm'}`,
        ];
      }

      // 환경 변수 설정
      case CICDBlockType.ENVIRONMENT_SETUP: {
        const envBlock = block as any;
        const commands: string[] = [];
        if (envBlock.environmentVariables) {
          Object.entries(envBlock.environmentVariables).forEach(
            ([key, value]) => {
              commands.push(`export ${key}="${String(value)}"`);
            },
          );
        }
        return commands;
      }

      // Node.js 패키지 설치
      case CICDBlockType.INSTALL_MODULE_NODE: {
        const installBlock = block as any;
        const manager = installBlock.packageManager || 'npm';
        const commands: string[] = [];

        if (installBlock.cleanInstall) {
          commands.push(`${manager} ci`);
        } else {
          commands.push(`${manager} install`);
        }

        if (installBlock.installPackages?.length > 0) {
          commands.push(
            `${manager} install ${installBlock.installPackages.join(' ')}`,
          );
        }

        return commands;
      }

      // Webpack 빌드
      case CICDBlockType.BUILD_WEBPACK: {
        const webpackBlock = block as any;
        const commands: string[] = [];
        if (webpackBlock.configFile) {
          commands.push(
            `npx webpack --config ${webpackBlock.configFile} --mode ${webpackBlock.mode}`,
          );
        } else {
          commands.push(`npx webpack --mode ${webpackBlock.mode}`);
        }
        return commands;
      }

      // Vite 빌드
      case CICDBlockType.BUILD_VITE: {
        const viteBlock = block as any;
        return [`npx vite build --mode ${viteBlock.mode}`];
      }

      // 커스텀 빌드
      case CICDBlockType.BUILD_CUSTOM: {
        const customBlock = block as any;
        const manager = customBlock.packageManager || 'npm';
        if (customBlock.scriptName) {
          return [`${manager} run ${customBlock.scriptName}`];
        }
        return customBlock.customCommands || [];
      }

      // Jest 테스트
      case CICDBlockType.TEST_JEST: {
        const jestBlock = block as any;
        const commands: string[] = [];
        let jestCmd = 'npx jest';

        if (jestBlock.configFile) {
          jestCmd += ` --config ${jestBlock.configFile}`;
        }
        if (jestBlock.coverage) {
          jestCmd += ' --coverage';
        }
        if (jestBlock.testPattern) {
          jestCmd += ` ${jestBlock.testPattern}`;
        }

        commands.push(jestCmd);
        return commands;
      }

      // Mocha 테스트
      case CICDBlockType.TEST_MOCHA: {
        const mochaBlock = block as any;
        let mochaCmd = 'npx mocha';

        if (mochaBlock.configFile) {
          mochaCmd += ` --config ${mochaBlock.configFile}`;
        }
        if (mochaBlock.reporter) {
          mochaCmd += ` --reporter ${mochaBlock.reporter}`;
        }
        if (mochaBlock.testFiles?.length > 0) {
          mochaCmd += ` ${mochaBlock.testFiles.join(' ')}`;
        }

        return [mochaCmd];
      }

      // Vitest 테스트
      case CICDBlockType.TEST_VITEST: {
        const vitestBlock = block as any;
        let vitestCmd = 'npx vitest run';

        if (vitestBlock.coverage) {
          vitestCmd += ' --coverage';
        }
        if (vitestBlock.configFile) {
          vitestCmd += ` --config ${vitestBlock.configFile}`;
        }

        return [vitestCmd];
      }

      // 커스텀 테스트
      case CICDBlockType.TEST_CUSTOM: {
        const customTestBlock = block as any;
        const manager = customTestBlock.packageManager || 'npm';
        if (customTestBlock.scriptName) {
          return [`${manager} run ${customTestBlock.scriptName}`];
        }
        return customTestBlock.customCommands || [];
      }

      // Slack 알림
      case CICDBlockType.NOTIFICATION_SLACK: {
        const slackBlock = block as any;
        return [
          `curl -X POST -H 'Content-type: application/json' --data '{"text":"${slackBlock.messageTemplate}"}' $${slackBlock.webhookUrlEnv}`,
        ];
      }

      // 이메일 알림
      case CICDBlockType.NOTIFICATION_EMAIL: {
        // AWS SES 또는 다른 이메일 서비스 사용
        return ['echo "Email notification would be sent here"'];
      }

      // 커스텀 명령어
      case CICDBlockType.CUSTOM_COMMAND: {
        const customBlock = block as any;
        return customBlock.commands || [];
      }

      default:
        return [];
    }
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
   * camelCase Pipeline Input으로 빌드를 시작합니다
   *
   * @description
   * otto-ui에서 전송하는 camelCase 형태의 파이프라인 데이터를 받아서
   * AWS CodeBuild buildspec.yml로 변환한 후 빌드를 시작합니다.
   * 환경변수는 블록 내부에서 파싱되므로 별도로 전달하지 않습니다.
   *
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @param input - camelCase 형태의 파이프라인 입력
   * @returns 빌드 시작 결과
   */
  async startPipelineBuild(
    userId: string,
    projectId: string,
    input: SimplePipelineInput,
  ) {
    // camelCase 파이프라인을 buildspec.yml로 변환
    const buildSpecYaml = this.convertPipelineInputToBuildSpec(input);

    this.logger.log(
      `Generated buildspec.yml for camelCase pipeline ${projectId}:`,
      buildSpecYaml,
    );

    // projectId를 기반으로 AWS CodeBuild 프로젝트명 생성
    const codebuildProjectName = `otto-${userId}-${projectId}`;

    // 빌드 시작 (환경변수는 블록 내부에서 처리되므로 undefined 전달)
    return this.startBuild(
      userId,
      projectId,
      codebuildProjectName,
      buildSpecYaml,
      undefined, // 환경변수는 블록 내부에서 파싱되므로 별도로 전달하지 않음
    );
  }

  /**
   * AWS CodeBuild API 연결 테스트
   *
   * @description
   * ListProjects API를 호출하여 AWS 자격 증명과 연결 상태를 확인합니다.
   * 가장 간단한 읽기 전용 API를 사용하여 권한을 테스트합니다.
   *
   * @returns AWS CodeBuild 프로젝트 목록
   * @throws AWS API 오류 (UnrecognizedClientException, AccessDeniedException 등)
   */
  async testConnection(): Promise<string[]> {
    try {
      this.logger.log('[testConnection] AWS CodeBuild 연결 테스트 시작...');

      // ListProjects는 가장 간단한 읽기 권한 테스트
      const command = new ListProjectsCommand({});

      this.logger.log('[testConnection] ListProjects 명령 실행 중...');
      const response = await this.codeBuildClient.send(command);

      this.logger.log('[testConnection] AWS CodeBuild 연결 성공!', {
        projectCount: response.projects?.length || 0,
        projects: response.projects?.slice(0, 5), // 처음 5개만 로깅
      });

      return response.projects || [];
    } catch (error: any) {
      this.logger.error('[testConnection] AWS CodeBuild 연결 실패:', {
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.$metadata?.httpStatusCode,
      });

      // 에러를 그대로 throw하여 컨트롤러에서 처리
      throw error;
    }
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

      try {
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
      } catch (createError: unknown) {
        // 이미 존재하는 프로젝트인 경우 기존 프로젝트 정보 반환
        const error = createError as { __type?: string; name?: string };
        if (
          error.__type === 'ResourceAlreadyExistsException' ||
          error.name === 'ResourceAlreadyExistsException'
        ) {
          this.logger.warn(
            `[CodeBuildService] CodeBuild 프로젝트가 이미 존재함: ${codebuildProjectName}`,
          );

          // 기존 프로젝트 정보 조회
          try {
            const batchGetCommand = new BatchGetProjectsCommand({
              names: [codebuildProjectName],
            });

            const existingProject =
              await this.codeBuildClient.send(batchGetCommand);

            if (
              existingProject.projects &&
              existingProject.projects.length > 0
            ) {
              const project = existingProject.projects[0];
              this.logger.log(
                `[CodeBuildService] 기존 프로젝트 사용: ${project.name} (ARN: ${project.arn})`,
              );

              // 기존 프로젝트의 소스 설정을 업데이트 (필요한 경우)
              const updateCommand = new UpdateProjectCommand({
                name: codebuildProjectName,
                source: {
                  type: 'GITHUB',
                  location: githubRepoUrl,
                  buildspec: this.createDefaultBuildspec(),
                },
                sourceVersion: `refs/heads/${selectedBranch}`,
              });

              await this.codeBuildClient.send(updateCommand);
              this.logger.log(
                `[CodeBuildService] 기존 프로젝트 소스 설정 업데이트 완료`,
              );

              return {
                projectName: project.name || codebuildProjectName,
                projectArn: project.arn || '',
                logGroupName,
              };
            }
          } catch (getError) {
            this.logger.error(
              `[CodeBuildService] 기존 프로젝트 조회 실패:`,
              getError,
            );
          }
        }

        // 다른 오류의 경우 그대로 throw
        throw createError;
      }
    } catch (error) {
      this.logger.error(`CodeBuild 프로젝트 생성 실패: ${projectName}`, error);
      throw error;
    }
  }

  /**
   * CodeBuild 프로젝트를 삭제합니다
   *
   * 프로젝트 삭제 시 연동된 AWS CodeBuild 프로젝트를 삭제합니다.
   * 에러가 발생해도 예외를 발생시키지 않고 로그만 남깁니다.
   *
   * @param codebuildProjectName - CodeBuild 프로젝트 이름
   * @returns 삭제 성공 여부
   *
   * @example
   * ```typescript
   * const success = await codeBuildService.deleteCodeBuildProject(
   *   'otto-my-project-user-123'
   * );
   * console.log(success); // true or false
   * ```
   */
  async deleteCodeBuildProject(codebuildProjectName: string): Promise<boolean> {
    try {
      this.logger.log(`[CodeBuildService] deleteCodeBuildProject 시작:`, {
        codebuildProjectName,
      });

      const deleteProjectCommand = new DeleteProjectCommand({
        name: codebuildProjectName,
      });

      this.logger.log(
        `[CodeBuildService] AWS CodeBuild 프로젝트 삭제 API 호출 시작...`,
      );

      await this.codeBuildClient.send(deleteProjectCommand);

      this.logger.log(`CodeBuild 프로젝트 삭제 완료: ${codebuildProjectName}`);

      return true;
    } catch (error) {
      // CodeBuild 프로젝트가 존재하지 않는 경우나 다른 에러의 경우 로그만 남기고 계속 진행
      this.logger.warn(
        `CodeBuild 프로젝트 삭제 실패 (계속 진행): ${codebuildProjectName}`,
        error,
      );
      return false;
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
}
