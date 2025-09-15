import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
} from '@aws-sdk/client-codebuild';
import * as yaml from 'js-yaml';

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

@Injectable()
export class CodeBuildService {
  private readonly logger = new Logger(CodeBuildService.name);
  private readonly codeBuildClient: CodeBuildClient;
  private readonly projectName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials are required: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
      );
    }

    this.codeBuildClient = new CodeBuildClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const projectName = this.configService.get<string>(
      'CODEBUILD_PROJECT_NAME',
    );
    if (!projectName) {
      throw new Error(
        'CODEBUILD_PROJECT_NAME environment variable is required',
      );
    }
    this.projectName = projectName;
  }

  convertJsonToBuildSpec(input: BuildSpecInput): string {
    const buildSpec: BuildSpecYaml = {
      version: input.version || '0.2',
      phases: {},
    };

    // Handle runtime
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

    // Handle commands
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

        // Add on-failure handling to non-finally phases
        if (input.on_failure && phase !== 'finally') {
          (buildSpec.phases[phase] as any)['on-failure'] = input.on_failure;
        }
      }
    });

    // Handle artifacts
    if (input.artifacts && input.artifacts.length > 0) {
      buildSpec.artifacts = {
        files: input.artifacts,
      };
    }

    // Handle environment variables and secrets
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

    // Handle cache
    if (input.cache && input.cache.paths && input.cache.paths.length > 0) {
      buildSpec.cache = {
        paths: input.cache.paths,
      };
    }

    // Handle reports
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

  async startBuild(
    buildSpecOverride: string,
    environmentVariables?: Record<string, string>,
  ) {
    try {
      const command = new StartBuildCommand({
        projectName: this.projectName,
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

      this.logger.log(`Build started: ${response.build?.id}`);

      return {
        buildId: response.build?.id || '',
        buildStatus: response.build?.buildStatus || '',
        projectName: response.build?.projectName || '',
        startTime: response.build?.startTime,
      };
    } catch (error) {
      this.logger.error('Failed to start build:', error);
      throw error;
    }
  }

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

  async startBuildFromJson(
    input: BuildSpecInput,
    environmentVariables?: Record<string, string>,
  ) {
    const buildSpecYaml = this.convertJsonToBuildSpec(input);

    this.logger.log('Generated buildspec.yml:', buildSpecYaml);

    return this.startBuild(buildSpecYaml, environmentVariables);
  }
}
