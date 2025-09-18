/**
 * @fileoverview camelCase 기반 Pipeline 입력 타입 정의
 * @description otto-ui에서 전송하는 camelCase JSON을 위한 타입 시스템
 * @module pipeline-input.types
 */

/**
 * CICD 블록 타입 열거형 (camelCase)
 */
export enum CICDBlockType {
  // Pipeline Start
  PIPELINE_START = 'pipeline_start',

  // Prebuild
  OS_PACKAGE = 'os_package',
  NODE_VERSION = 'node_version',
  ENVIRONMENT_SETUP = 'environment_setup',

  // Build
  INSTALL_MODULE_NODE = 'install_module_node',
  BUILD_WEBPACK = 'build_webpack',
  BUILD_VITE = 'build_vite',
  BUILD_CUSTOM = 'build_custom',

  // Test
  TEST_JEST = 'test_jest',
  TEST_MOCHA = 'test_mocha',
  TEST_VITEST = 'test_vitest',
  TEST_CUSTOM = 'test_custom',

  // Notification
  NOTIFICATION_SLACK = 'notification_slack',
  NOTIFICATION_EMAIL = 'notification_email',

  // Utility
  CONDITION_BRANCH = 'condition_branch',
  PARALLEL_EXECUTION = 'parallel_execution',
  CUSTOM_COMMAND = 'custom_command',
}

/**
 * CICD 블록 그룹 타입 열거형 (camelCase)
 */
export enum CICDBlockGroup {
  START = 'start',
  PREBUILD = 'prebuild',
  BUILD = 'build',
  TEST = 'test',
  NOTIFICATION = 'notification',
  UTILITY = 'utility',
}

/**
 * 기본 Pipeline 블록 인터페이스 (camelCase)
 */
export interface PipelineBlock {
  label: string;
  blockType: CICDBlockType;
  groupType: CICDBlockGroup;
  blockId: string;
  description?: string;
  onSuccess?: string | null;
  onFailed?: string | null;
  timeout?: number;
  retryCount?: number;
}

/**
 * Pipeline Start 블록
 */
export interface PipelineStartBlock extends PipelineBlock {
  blockType: CICDBlockType.PIPELINE_START;
  groupType: CICDBlockGroup.START;
  triggerType?: 'manual' | 'schedule' | 'webhook' | 'push' | 'pullRequest';
  triggerConfig?: {
    schedule?: string;
    branchPatterns?: string[];
    filePatterns?: string[];
  };
}

/**
 * OS Package 블록
 */
export interface OSPackageBlock extends PipelineBlock {
  blockType: CICDBlockType.OS_PACKAGE;
  groupType: CICDBlockGroup.PREBUILD;
  packageManager: 'apt' | 'yum' | 'dnf' | 'apk' | 'zypper' | 'pacman' | 'brew';
  installPackages: string[];
  updatePackageList?: boolean;
}

/**
 * Node Version 블록
 */
export interface NodeVersionBlock extends PipelineBlock {
  blockType: CICDBlockType.NODE_VERSION;
  groupType: CICDBlockGroup.PREBUILD;
  version: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
}

/**
 * Environment Setup 블록
 */
export interface EnvironmentSetupBlock extends PipelineBlock {
  blockType: CICDBlockType.ENVIRONMENT_SETUP;
  groupType: CICDBlockGroup.PREBUILD;
  environmentVariables: Record<string, string>;
  loadFromFile?: string;
}

/**
 * Install Node Packages 블록
 */
export interface InstallNodePackagesBlock extends PipelineBlock {
  blockType: CICDBlockType.INSTALL_MODULE_NODE;
  groupType: CICDBlockGroup.BUILD;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  installPackages?: string[];
  installDevDependencies?: boolean;
  productionOnly?: boolean;
  cleanInstall?: boolean;
}

/**
 * Build Webpack 블록
 */
export interface BuildWebpackBlock extends PipelineBlock {
  blockType: CICDBlockType.BUILD_WEBPACK;
  groupType: CICDBlockGroup.BUILD;
  configFile?: string;
  mode: 'development' | 'production';
  outputPath?: string;
  additionalOptions?: string[];
}

/**
 * Build Vite 블록
 */
export interface BuildViteBlock extends PipelineBlock {
  blockType: CICDBlockType.BUILD_VITE;
  groupType: CICDBlockGroup.BUILD;
  configFile?: string;
  mode: 'development' | 'production';
  basePath?: string;
  outputDir?: string;
}

/**
 * Build Custom 블록
 */
export interface BuildCustomBlock extends PipelineBlock {
  blockType: CICDBlockType.BUILD_CUSTOM;
  groupType: CICDBlockGroup.BUILD;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  scriptName?: string;
  customCommands?: string[];
  workingDirectory?: string;
}

/**
 * Test Jest 블록
 */
export interface TestJestBlock extends PipelineBlock {
  blockType: CICDBlockType.TEST_JEST;
  groupType: CICDBlockGroup.TEST;
  configFile?: string;
  testPattern?: string;
  coverage?: boolean;
  watchMode?: boolean;
  maxWorkers?: number;
  additionalOptions?: string[];
}

/**
 * Test Mocha 블록
 */
export interface TestMochaBlock extends PipelineBlock {
  blockType: CICDBlockType.TEST_MOCHA;
  groupType: CICDBlockGroup.TEST;
  testFiles?: string[];
  configFile?: string;
  reporter?: 'spec' | 'json' | 'html' | 'tap' | 'dot';
  timeout?: number;
  grep?: string;
}

/**
 * Test Vitest 블록
 */
export interface TestVitestBlock extends PipelineBlock {
  blockType: CICDBlockType.TEST_VITEST;
  groupType: CICDBlockGroup.TEST;
  configFile?: string;
  coverage?: boolean;
  ui?: boolean;
  watchMode?: boolean;
  environment?: 'node' | 'jsdom' | 'happy-dom';
}

/**
 * Test Custom 블록
 */
export interface TestCustomBlock extends PipelineBlock {
  blockType: CICDBlockType.TEST_CUSTOM;
  groupType: CICDBlockGroup.TEST;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  scriptName?: string;
  customCommands?: string[];
  generateReports?: boolean;
  coverageThreshold?: number;
}

/**
 * Notification Slack 블록
 */
export interface NotificationSlackBlock extends PipelineBlock {
  blockType: CICDBlockType.NOTIFICATION_SLACK;
  groupType: CICDBlockGroup.NOTIFICATION;
  webhookUrlEnv: string;
  channel?: string;
  messageTemplate: string;
  onSuccessOnly?: boolean;
  onFailureOnly?: boolean;
}

/**
 * Notification Email 블록
 */
export interface NotificationEmailBlock extends PipelineBlock {
  blockType: CICDBlockType.NOTIFICATION_EMAIL;
  groupType: CICDBlockGroup.NOTIFICATION;
  smtpConfig: {
    host: string;
    port: number;
    usernameEnv: string;
    passwordEnv: string;
  };
  recipients: string[];
  subjectTemplate: string;
  bodyTemplate: string;
}

/**
 * Condition Branch 블록
 */
export interface ConditionBranchBlock extends PipelineBlock {
  blockType: CICDBlockType.CONDITION_BRANCH;
  groupType: CICDBlockGroup.UTILITY;
  conditionType: 'environment' | 'fileExists' | 'commandOutput' | 'custom';
  conditionConfig: {
    environmentVar?: string;
    expectedValue?: string;
    filePath?: string;
    command?: string;
    customScript?: string;
  };
  onConditionTrue: string;
  onConditionFalse: string;
}

/**
 * Parallel Execution 블록
 */
export interface ParallelExecutionBlock extends PipelineBlock {
  blockType: CICDBlockType.PARALLEL_EXECUTION;
  groupType: CICDBlockGroup.UTILITY;
  parallelBranches: string[];
  waitForAll?: boolean;
  failFast?: boolean;
  onAllSuccess: string;
  onAnyFailure?: string;
}

/**
 * Custom Command 블록
 */
export interface CustomCommandBlock extends PipelineBlock {
  blockType: CICDBlockType.CUSTOM_COMMAND;
  groupType: CICDBlockGroup.UTILITY;
  commands: string[];
  workingDirectory?: string;
  shell?: 'bash' | 'sh' | 'zsh' | 'fish';
  environmentVariables?: Record<string, string>;
  ignoreErrors?: boolean;
}

/**
 * 모든 파이프라인 블록 유니온 타입
 */
export type AnyPipelineBlock =
  | PipelineStartBlock
  | OSPackageBlock
  | NodeVersionBlock
  | EnvironmentSetupBlock
  | InstallNodePackagesBlock
  | BuildWebpackBlock
  | BuildViteBlock
  | BuildCustomBlock
  | TestJestBlock
  | TestMochaBlock
  | TestVitestBlock
  | TestCustomBlock
  | NotificationSlackBlock
  | NotificationEmailBlock
  | ConditionBranchBlock
  | ParallelExecutionBlock
  | CustomCommandBlock;

/**
 * Pipeline 입력 인터페이스 (camelCase)
 */
export interface PipelineInput {
  version?: string;
  runtime?: string;
  blocks: AnyPipelineBlock[];
  artifacts?: string[];
  environmentVariables?: Record<string, string>;
  cache?: {
    paths?: string[];
  };
  reports?: Record<
    string,
    {
      files: string[];
      fileFormat?:
        | 'JUNITXML'
        | 'CUCUMBERJSON'
        | 'TESTNGXML'
        | 'CLOVERXML'
        | 'VISUALSTUDIOTRX'
        | 'JACOCOXML'
        | 'NUNITXML'
        | 'NUNIT3XML';
      baseDirectory?: string;
      discardPaths?: boolean;
    }
  >;
  onFailure?: 'ABORT' | 'CONTINUE';
  secrets?: Record<string, string>;
}

/**
 * 간단한 블록 배열 입력 인터페이스 (otto-ui용)
 * 블록 배열만 받고, version, runtime, environmentVariables 등은 모두 블록 내부에서 파싱
 */
export interface SimplePipelineInput {
  blocks: AnyPipelineBlock[];
}
