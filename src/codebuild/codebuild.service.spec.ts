import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CodeBuildService, BuildSpecInput } from './codebuild.service';

describe('CodeBuildService', () => {
  let service: CodeBuildService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'mock-access-key',
        AWS_SECRET_ACCESS_KEY: 'mock-secret-key',
        CODEBUILD_PROJECT_NAME: 'test-project',
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeBuildService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CodeBuildService>(CodeBuildService);
  });

  describe('convertJsonToBuildSpec', () => {
    it('기본 구조를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('version: "0.2"');
      expect(result).toContain('phases:');
      expect(result).toContain('build:');
      expect(result).toContain('commands:');
      expect(result).toContain('- npm run build');
    });

    it('런타임을 올바르게 분리해야 함', () => {
      const input: BuildSpecInput = {
        runtime: 'nodejs:18',
        commands: {
          build: ['npm run build'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('install:');
      expect(result).toContain('runtime-versions:');
      expect(result).toContain('nodejs: "18"');
    });

    it('모든 phase를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          install: ['npm install'],
          pre_build: ['echo "pre-build"'],
          build: ['npm run build'],
          post_build: ['echo "post-build"'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('install:');
      expect(result).toContain('pre_build:');
      expect(result).toContain('build:');
      expect(result).toContain('post_build:');
      expect(result).toContain('npm install');
      expect(result).toContain('echo "pre-build"');
      expect(result).toContain('npm run build');
      expect(result).toContain('echo "post-build"');
    });

    it('artifacts를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
        },
        artifacts: ['dist/**/*', 'package.json'],
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('artifacts:');
      expect(result).toContain('files:');
      expect(result).toContain('- dist/**/*');
      expect(result).toContain('- package.json');
    });

    it('환경변수를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
        },
        environment_variables: {
          NODE_ENV: 'production',
          API_URL: 'https://api.example.com',
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('env:');
      expect(result).toContain('variables:');
      expect(result).toContain('NODE_ENV: production');
      expect(result).toContain('API_URL: https://api.example.com');
    });

    it('런타임과 install 명령어를 함께 처리해야 함', () => {
      const input: BuildSpecInput = {
        runtime: 'python:3.9',
        commands: {
          install: ['pip install -r requirements.txt'],
          build: ['python setup.py build'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('install:');
      expect(result).toContain('runtime-versions:');
      expect(result).toContain('python: "3.9"');
      expect(result).toContain('commands:');
      expect(result).toContain('- pip install -r requirements.txt');
    });

    it('빈 배열은 무시해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          install: [],
          build: ['npm run build'],
          post_build: [],
        },
        artifacts: [],
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).not.toContain('install:');
      expect(result).toContain('build:');
      expect(result).not.toContain('post_build:');
      expect(result).not.toContain('artifacts:');
    });

    it('완전한 예제를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        version: '0.2',
        runtime: 'nodejs:18',
        commands: {
          install: ['npm install'],
          pre_build: ['echo "Starting pre-build"'],
          build: ['npm run build', 'npm run test'],
          post_build: ['echo "Build completed"'],
        },
        artifacts: ['dist/**/*'],
        environment_variables: {
          NODE_ENV: 'production',
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      // YAML 구조 검증
      expect(result).toContain('version: "0.2"');
      expect(result).toContain('phases:');
      expect(result).toContain('artifacts:');
      expect(result).toContain('env:');

      // 내용 검증
      expect(result).toContain('nodejs: "18"');
      expect(result).toContain('npm install');
      expect(result).toContain('npm run build');
      expect(result).toContain('NODE_ENV: production');

      console.log('Generated YAML:', result);
    });

    it('cache를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
        },
        cache: {
          paths: ['node_modules/**/*', '.npm/**/*'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('cache:');
      expect(result).toContain('paths:');
      expect(result).toContain('- node_modules/**/*');
      expect(result).toContain('- .npm/**/*');
    });

    it('reports를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run test'],
        },
        reports: {
          'jest-reports': {
            files: ['test-results.xml'],
            'file-format': 'JUNITXML',
            'base-directory': 'test-results',
          },
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('reports:');
      expect(result).toContain('jest-reports:');
      expect(result).toContain('files:');
      expect(result).toContain('- test-results.xml');
      expect(result).toContain('file-format: JUNITXML');
      expect(result).toContain('base-directory: test-results');
    });

    it('finally phase를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
          finally: ['echo "Cleanup"', 'rm -rf temp'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('finally:');
      expect(result).toContain('echo "Cleanup"');
      expect(result).toContain('rm -rf temp');
    });

    it('secrets를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
        },
        secrets: {
          API_KEY: '/myapp/api-key',
          DB_PASSWORD: '/myapp/db-password',
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('env:');
      expect(result).toContain('secrets-manager:');
      expect(result).toContain('API_KEY: /myapp/api-key');
      expect(result).toContain('DB_PASSWORD: /myapp/db-password');
    });

    it('on-failure를 올바르게 변환해야 함', () => {
      const input: BuildSpecInput = {
        commands: {
          build: ['npm run build'],
          post_build: ['npm run deploy'],
        },
        on_failure: 'CONTINUE',
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('on-failure: CONTINUE');
    });

    it('콜론 없는 런타임을 올바르게 처리해야 함', () => {
      const input: BuildSpecInput = {
        runtime: 'nodejs',
        commands: {
          build: ['npm run build'],
        },
      };

      const result = service.convertJsonToBuildSpec(input);

      expect(result).toContain('nodejs: latest');
    });
  });
});
