import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CodeBuildService } from './codebuild.service';
import { BuildsService } from '../builds/builds.service';
import {
  FlowPipelineInput,
  BlockTypeEnum,
  BlockGroupType,
} from './types/flow-block.types';

/**
 * CodeBuildService 단위 테스트
 *
 * @description
 * AWS CodeBuild 서비스의 핵심 기능을 테스트합니다.
 * FlowBlock 파이프라인을 AWS CodeBuild buildspec.yml로 변환하는 로직을 검증합니다.
 *
 * ## 테스트 범위
 * - FlowBlock to buildspec.yml 변환
 * - 각 블록 타입별 명령어 생성
 * - 조건부 플로우(on_success/on_failed) 처리
 * - 그룹별 단계 매핑
 * - 환경 설정 및 아티팩트 처리
 *
 * @module CodeBuildService.spec
 * @see {@link CodeBuildService}
 * @see {@link FlowPipelineInput}
 */
describe('CodeBuildService', () => {
  let service: CodeBuildService;

  /**
   * Mock ConfigService 설정
   * AWS 자격 증명 및 리전 정보를 제공합니다
   */
  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'mock-access-key',
        AWS_SECRET_ACCESS_KEY: 'mock-secret-key',
      };
      return config[key];
    }),
  };

  /**
   * Mock BuildsService 설정
   * 빌드 이력 저장 관련 메서드를 모킹합니다
   */
  const mockBuildsService = {
    saveBuildStart: jest.fn(),
    updateBuildStatus: jest.fn(),
    saveBuildPhases: jest.fn(),
  };

  /**
   * 각 테스트 전 실행되는 설정
   * 테스트 모듈을 생성하고 서비스 인스턴스를 초기화합니다
   */
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeBuildService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: BuildsService,
          useValue: mockBuildsService,
        },
      ],
    }).compile();

    service = module.get<CodeBuildService>(CodeBuildService);
  });

  /**
   * convertFlowPipelineToBuildSpec 메서드 테스트 스위트
   *
   * @description
   * FlowBlock 파이프라인을 buildspec.yml로 변환하는 핵심 기능을 테스트합니다
   */
  describe('convertFlowPipelineToBuildSpec', () => {
    /**
     * 기본 FlowBlock 구조 변환 테스트
     *
     * @test
     * @description 가장 간단한 FlowBlock 파이프라인이 올바르게 변환되는지 확인합니다
     */
    it('기본 FlowBlock 구조를 올바르게 변환해야 함', () => {
      // Arrange: 테스트 입력 데이터 준비
      const input: FlowPipelineInput = {
        version: '0.2',
        blocks: [
          {
            id: 'build-1',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
          },
        ],
      };

      // Act: 변환 실행
      const result = service.convertFlowPipelineToBuildSpec(input);

      // Assert: 결과 검증
      expect(result).toContain('version: "0.2"');
      expect(result).toContain('phases:');
      expect(result).toContain('build:');
      expect(result).toContain('commands:');
      expect(result).toContain('npm run build');
    });

    /**
     * Node.js 패키지 매니저 블록 테스트
     *
     * @test
     * @description NODE_PACKAGE_MANAGER 블록이 올바른 npm 명령어로 변환되는지 확인합니다
     */
    it('NODE_PACKAGE_MANAGER 블록을 올바르게 변환해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'install-deps',
            block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER,
            group_type: BlockGroupType.BUILD,
            package_manager: 'npm',
            package_list: ['express', 'typescript'],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('# Block: install-deps');
      expect(result).toContain('npm install express typescript');
    });

    /**
     * OS 패키지 매니저 블록 테스트
     *
     * @test
     * @description OS_PACKAGE_MANAGER 블록이 apt-get 명령어로 올바르게 변환되는지 확인합니다
     * apt-get의 경우 update가 자동으로 먼저 실행되어야 합니다
     */
    it('OS_PACKAGE_MANAGER 블록을 올바르게 변환해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'install-os-deps',
            block_type: BlockTypeEnum.OS_PACKAGE_MANAGER,
            group_type: BlockGroupType.BUILD,
            package_manager: 'apt-get',
            package_list: ['curl', 'git'],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('# Block: install-os-deps');
      expect(result).toContain('apt-get update -y');
      expect(result).toContain('apt-get install -y curl git');
    });

    /**
     * 테스트 블록 처리 테스트
     *
     * @test
     * @description TEST 그룹의 블록이 post_build 단계에 배치되는지 확인합니다
     */
    it('TEST 그룹 블록을 post_build 단계에 배치해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'run-tests',
            block_type: BlockTypeEnum.NODE_TEST_COMMAND,
            group_type: BlockGroupType.TEST,
            package_manager: 'npm',
            test_command: ['npm test', 'npm run test:coverage'],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('post_build:');
      expect(result).toContain('# Test Block: run-tests');
      expect(result).toContain('npm test');
      expect(result).toContain('npm run test:coverage');
      expect(result).toContain('on-failure: CONTINUE'); // 테스트는 실패해도 계속
    });

    /**
     * CUSTOM 그룹 블록 처리 테스트
     *
     * @test
     * @description CUSTOM 그룹의 블록이 pre_build 단계에 배치되는지 확인합니다
     */
    it('CUSTOM 그룹 블록을 pre_build 단계에 배치해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'custom-setup',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.CUSTOM,
            custom_command: [
              'echo "Setting up environment"',
              'export NODE_ENV=test',
            ],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('pre_build:');
      expect(result).toContain('# Custom Block: custom-setup');
      expect(result).toContain('echo "Setting up environment"');
      expect(result).toContain('export NODE_ENV=test');
    });

    /**
     * RUN 그룹 블록 처리 테스트
     *
     * @test
     * @description RUN 그룹의 블록이 post_build 단계 후반부에 배치되는지 확인합니다
     */
    it('RUN 그룹 블록을 post_build 단계 후반부에 배치해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'deploy',
            block_type: BlockTypeEnum.CUSTOM_RUN_COMMAND,
            group_type: BlockGroupType.RUN,
            custom_command: ['aws s3 sync dist/ s3://my-bucket/'],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('post_build:');
      expect(result).toContain('# Run Block: deploy');
      expect(result).toContain('aws s3 sync dist/ s3://my-bucket/');
    });

    /**
     * 조건부 플로우(on_failed) 테스트
     *
     * @test
     * @description on_failed 설정이 있는 블록이 if/then/else 구문으로 변환되는지 확인합니다
     */
    it('on_failed 조건부 플로우를 올바르게 변환해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'build-app',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
            on_failed: 'handle-failure',
          },
          {
            id: 'handle-failure',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: [
              'echo "Build failed, trying alternative build"',
              'npm run build:fallback',
            ],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('# Block: build-app (with fallback)');
      expect(result).toContain('if');
      expect(result).toContain('npm run build');
      expect(result).toContain('then');
      expect(result).toContain('echo \\"Block build-app succeeded\\"');
      expect(result).toContain('else');
      expect(result).toContain(
        'echo \\"Block build-app failed, running fallback\\"',
      );
      expect(result).toContain(
        'echo \\"Build failed, trying alternative build\\"',
      );
      expect(result).toContain('npm run build:fallback');
      expect(result).toContain('fi');
    });

    /**
     * 런타임 버전 설정 테스트
     *
     * @test
     * @description runtime 설정이 install 단계의 runtime-versions로 변환되는지 확인합니다
     */
    it('런타임 버전을 올바르게 설정해야 함', () => {
      const input: FlowPipelineInput = {
        runtime: 'nodejs:18',
        blocks: [
          {
            id: 'build',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('install:');
      expect(result).toContain('runtime-versions:');
      expect(result).toContain('nodejs: "18"');
    });

    /**
     * 환경 변수 설정 테스트
     *
     * @test
     * @description environment_variables가 env.variables로 변환되는지 확인합니다
     */
    it('환경 변수를 올바르게 설정해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'build',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
          },
        ],
        environment_variables: {
          NODE_ENV: 'production',
          API_URL: 'https://api.example.com',
        },
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('env:');
      expect(result).toContain('variables:');
      expect(result).toContain('NODE_ENV: production');
      expect(result).toContain('API_URL: https://api.example.com');
    });

    /**
     * 아티팩트 설정 테스트
     *
     * @test
     * @description artifacts 배열이 올바르게 변환되는지 확인합니다
     */
    it('아티팩트를 올바르게 설정해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'build',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
          },
        ],
        artifacts: ['dist/**/*', 'package.json'],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('artifacts:');
      expect(result).toContain('files:');
      expect(result).toContain('- dist/**/*');
      expect(result).toContain('- package.json');
    });

    /**
     * 캐시 설정 테스트
     *
     * @test
     * @description cache.paths가 올바르게 변환되는지 확인합니다
     */
    it('캐시 경로를 올바르게 설정해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'build',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
          },
        ],
        cache: {
          paths: ['node_modules/**/*', '.npm/**/*'],
        },
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('cache:');
      expect(result).toContain('paths:');
      expect(result).toContain('- node_modules/**/*');
      expect(result).toContain('- .npm/**/*');
    });

    /**
     * 시크릿 설정 테스트
     *
     * @test
     * @description secrets가 env.secrets-manager로 변환되는지 확인합니다
     */
    it('AWS Secrets Manager 시크릿을 올바르게 설정해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'build',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
          },
        ],
        secrets: {
          API_KEY: 'arn:aws:secretsmanager:us-east-1:123456789:secret:api-key',
          DB_PASSWORD:
            'arn:aws:secretsmanager:us-east-1:123456789:secret:db-pass',
        },
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('env:');
      expect(result).toContain('secrets-manager:');
      expect(result).toContain(
        'API_KEY: arn:aws:secretsmanager:us-east-1:123456789:secret:api-key',
      );
      expect(result).toContain(
        'DB_PASSWORD: arn:aws:secretsmanager:us-east-1:123456789:secret:db-pass',
      );
    });

    /**
     * 복잡한 파이프라인 통합 테스트
     *
     * @test
     * @description 여러 블록과 조건부 플로우가 포함된 복잡한 파이프라인을 테스트합니다
     */
    it('복잡한 파이프라인을 올바르게 변환해야 함', () => {
      const input: FlowPipelineInput = {
        version: '0.2',
        runtime: 'nodejs:18',
        blocks: [
          // CUSTOM 그룹 - pre_build
          {
            id: 'setup',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.CUSTOM,
            custom_command: ['echo "Starting build process"'],
          },
          // BUILD 그룹 - build
          {
            id: 'install-deps',
            block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER,
            group_type: BlockGroupType.BUILD,
            package_manager: 'npm',
            package_list: [],
          },
          {
            id: 'build-app',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build'],
            on_failed: 'build-fallback',
          },
          {
            id: 'build-fallback',
            block_type: BlockTypeEnum.CUSTOM_BUILD_COMMAND,
            group_type: BlockGroupType.BUILD,
            custom_command: ['npm run build:fallback'],
          },
          // TEST 그룹 - post_build 초반
          {
            id: 'test-app',
            block_type: BlockTypeEnum.NODE_TEST_COMMAND,
            group_type: BlockGroupType.TEST,
            package_manager: 'npm',
            test_command: ['npm test'],
            on_failed: 'test-retry',
          },
          {
            id: 'test-retry',
            block_type: BlockTypeEnum.CUSTOM_TEST_COMMAND,
            group_type: BlockGroupType.TEST,
            custom_command: ['npm run test:retry'],
          },
          // RUN 그룹 - post_build 후반
          {
            id: 'deploy',
            block_type: BlockTypeEnum.CUSTOM_RUN_COMMAND,
            group_type: BlockGroupType.RUN,
            custom_command: ['npm run deploy'],
          },
        ],
        artifacts: ['dist/**/*'],
        environment_variables: {
          NODE_ENV: 'production',
        },
        cache: {
          paths: ['node_modules/**/*'],
        },
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      // 전체 구조 검증
      expect(result).toContain('version: "0.2"');
      expect(result).toContain('phases:');
      expect(result).toContain('install:');
      expect(result).toContain('pre_build:');
      expect(result).toContain('build:');
      expect(result).toContain('post_build:');

      // 각 단계별 내용 검증
      expect(result).toContain('runtime-versions:');
      expect(result).toContain('nodejs: "18"');
      expect(result).toContain('# Custom Block: setup');
      expect(result).toContain('# Block: install-deps');
      expect(result).toContain('# Block: build-app (with fallback)');
      expect(result).toContain('# Block: build-fallback');
      expect(result).toContain('# Block: test-app (with fallback)');
      expect(result).toContain('# Test Block: test-retry');
      expect(result).toContain('# Run Block: deploy');

      // 환경 설정 검증
      expect(result).toContain('NODE_ENV: production');
      expect(result).toContain('- dist/**/*');
      expect(result).toContain('- node_modules/**/*');

      console.log('Generated complex pipeline YAML:', result);
    });

    /**
     * 빈 패키지 목록 처리 테스트
     *
     * @test
     * @description package_list가 비어있을 때 기본 install 명령어가 실행되는지 확인합니다
     */
    it('빈 패키지 목록을 가진 NODE_PACKAGE_MANAGER를 올바르게 처리해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'install',
            block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER,
            group_type: BlockGroupType.BUILD,
            package_manager: 'npm',
            package_list: [],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('npm install'); // 패키지 목록이 없으면 기본 install
    });

    /**
     * 다양한 패키지 매니저 테스트
     *
     * @test
     * @description yarn, pnpm 등 다른 패키지 매니저도 올바르게 처리되는지 확인합니다
     */
    it('다양한 Node.js 패키지 매니저를 지원해야 함', () => {
      const input: FlowPipelineInput = {
        blocks: [
          {
            id: 'yarn-install',
            block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER,
            group_type: BlockGroupType.BUILD,
            package_manager: 'yarn',
            package_list: ['react', 'react-dom'],
          },
          {
            id: 'pnpm-install',
            block_type: BlockTypeEnum.NODE_PACKAGE_MANAGER,
            group_type: BlockGroupType.BUILD,
            package_manager: 'pnpm',
            package_list: [],
          },
        ],
      };

      const result = service.convertFlowPipelineToBuildSpec(input);

      expect(result).toContain('yarn install react react-dom');
      expect(result).toContain('pnpm install');
    });
  });
});
