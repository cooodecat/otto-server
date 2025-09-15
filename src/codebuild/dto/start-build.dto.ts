import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * AWS CodeBuild 빌드 시작 요청 DTO
 *
 * 사용자로부터 받은 JSON 형태의 빌드 설정을 AWS CodeBuild buildspec.yml 포맷으로 변환하기 위한
 * 데이터 전송 객체입니다. 각 필드는 class-validator를 통해 검증됩니다.
 *
 * @description
 * 이 DTO는 다음과 같은 AWS CodeBuild buildspec 구조를 지원합니다:
 * - version: buildspec 버전 (기본값: '0.2')
 * - runtime: 빌드 환경의 런타임 (예: 'node:18', 'python:3.9')
 * - phases: 빌드 단계별 명령어 (install, pre_build, build, post_build, finally)
 * - artifacts: 빌드 결과물로 저장할 파일/디렉토리 경로
 * - environment_variables: 빌드 시 사용할 환경변수
 * - cache: 빌드 캐시 설정 (의존성 캐싱 등)
 * - reports: 테스트 리포트, 커버리지 리포트 설정
 * - on_failure: 빌드 실패 시 동작 (ABORT/CONTINUE)
 * - secrets: AWS Secrets Manager에서 가져올 시크릿 값들
 *
 * @example
 * ```typescript
 * const buildRequest: StartBuildDto = {
 *   runtime: 'node:18',
 *   commands: {
 *     install: ['npm ci'],
 *     build: ['npm run build', 'npm test']
 *   },
 *   artifacts: ['dist/**'],
 *   environment_variables: {
 *     NODE_ENV: 'production'
 *   }
 * };
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html} AWS CodeBuild Buildspec 참조
 * @since 1.0.0
 */

/**
 * 빌드 단계별 명령어 DTO
 *
 * AWS CodeBuild의 phases 섹션에 해당하는 각 빌드 단계별 실행 명령어들을 정의합니다.
 * 각 단계는 선택적이며, 배열 형태의 shell 명령어들을 받습니다.
 *
 * @description
 * 지원하는 빌드 단계:
 * - install: 런타임 설치 및 의존성 패키지 설치 명령어
 * - pre_build: 빌드 전 준비 작업 명령어 (환경 설정, 인증 등)
 * - build: 실제 빌드/컴파일/테스트 명령어
 * - post_build: 빌드 후 정리 작업 명령어 (아티팩트 준비, 알림 등)
 * - finally: 빌드 성공/실패와 관계없이 항상 실행되는 명령어
 *
 * @example
 * ```typescript
 * const commands: BuildCommandsDto = {
 *   install: [
 *     'apt-get update',
 *     'apt-get install -y git'
 *   ],
 *   pre_build: [
 *     'echo Logging in to Amazon ECR...',
 *     'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com'
 *   ],
 *   build: [
 *     'echo Build started on `date`',
 *     'npm run build',
 *     'npm test'
 *   ],
 *   post_build: [
 *     'echo Build completed on `date`'
 *   ]
 * };
 * ```
 */
export class BuildCommandsDto {
  /**
   * 설치 단계 명령어
   *
   * 런타임 환경 설정 및 의존성 패키지 설치에 사용되는 명령어들입니다.
   * 주로 패키지 매니저를 통한 의존성 설치, 시스템 패키지 설치 등에 사용됩니다.
   *
   * @example ['npm ci', 'pip install -r requirements.txt']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  install?: string[];

  /**
   * 빌드 전 단계 명령어
   *
   * 실제 빌드 작업 전에 수행해야 할 준비 작업들입니다.
   * 환경 변수 설정, 인증, 외부 서비스 연결, 설정 파일 생성 등에 사용됩니다.
   *
   * @example ['echo "Setting up environment..."', 'aws configure set region us-east-1']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pre_build?: string[];

  /**
   * 빌드 단계 명령어
   *
   * 실제 소스코드 빌드, 컴파일, 테스트 등의 핵심 빌드 작업들입니다.
   * 애플리케이션의 주요 빌드 프로세스가 이 단계에서 실행됩니다.
   *
   * @example ['npm run build', 'npm test', 'docker build -t myapp .']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  build?: string[];

  /**
   * 빌드 후 단계 명령어
   *
   * 빌드 완료 후 수행할 후처리 작업들입니다.
   * 아티팩트 준비, 배포 준비, 알림 전송, 정리 작업 등에 사용됩니다.
   *
   * @example ['echo "Build completed successfully"', 'aws s3 cp dist/ s3://my-bucket/ --recursive']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  post_build?: string[];

  /**
   * 마지막 단계 명령어
   *
   * 빌드 성공/실패와 관계없이 항상 실행되는 명령어들입니다.
   * 리소스 정리, 로그 업로드, 알림 등 반드시 실행되어야 하는 작업에 사용됩니다.
   *
   * @example ['echo "Cleaning up temporary files..."', 'rm -rf /tmp/build-cache']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  finally?: string[];
}

/**
 * 빌드 캐시 설정 DTO
 *
 * AWS CodeBuild의 캐시 기능을 설정하기 위한 데이터 구조입니다.
 * 빌드 시간 단축을 위해 의존성 패키지, 빌드 결과물 등을 캐싱할 수 있습니다.
 *
 * @description
 * 캐시 기능을 통해 다음과 같은 이점을 얻을 수 있습니다:
 * - 의존성 패키지 다운로드 시간 단축
 * - 빌드 아티팩트 재사용
 * - 전체적인 빌드 시간 단축
 * - AWS 데이터 전송 비용 절약
 *
 * @example
 * ```typescript
 * const cache: BuildCacheDto = {
 *   paths: [
 *     '/root/.npm',        // npm 캐시
 *     '/root/.yarn',       // yarn 캐시
 *     'node_modules',      // 의존성 패키지
 *     'dist/cache'         // 빌드 캐시
 *   ]
 * };
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/codebuild/latest/userguide/build-caching.html} AWS CodeBuild 캐싱
 */
export class BuildCacheDto {
  /**
   * 캐시할 경로 목록
   *
   * 빌드 간에 캐시하고 싶은 파일이나 디렉토리의 경로들입니다.
   * 일반적으로 패키지 매니저의 캐시 디렉토리나 의존성 설치 경로를 지정합니다.
   *
   * @example ['/root/.npm', 'node_modules/**', '.gradle/caches/**']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];
}

/**
 * 빌드 리포트 설정 DTO
 *
 * AWS CodeBuild의 reports 섹션에서 사용되는 테스트 리포트, 코드 커버리지 리포트 등의
 * 설정을 정의합니다. 다양한 리포트 형식을 지원합니다.
 *
 * @description
 * 지원하는 리포트 형식:
 * - JUNITXML: JUnit XML 테스트 결과 형식
 * - CUCUMBERJSON: Cucumber JSON 테스트 결과 형식
 * - TESTNGXML: TestNG XML 테스트 결과 형식
 * - CLOVERXML: Clover XML 코드 커버리지 형식
 * - VISUALSTUDIOTRX: Visual Studio TRX 테스트 결과 형식
 * - JACOCOXML: JaCoCo XML 코드 커버리지 형식
 * - NUNITXML: NUnit XML 테스트 결과 형식
 * - NUNIT3XML: NUnit3 XML 테스트 결과 형식
 *
 * @example
 * ```typescript
 * const report: BuildReportDto = {
 *   files: ['coverage/clover.xml', 'test-results/**\/*.xml'],
 *   'file-format': 'CLOVERXML',
 *   'base-directory': 'coverage',
 *   discard_paths: true
 * };
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/codebuild/latest/userguide/test-report.html} AWS CodeBuild 테스트 리포트
 */
export class BuildReportDto {
  /**
   * 리포트 파일 경로 패턴 목록
   *
   * 리포트로 수집할 파일들의 경로나 glob 패턴입니다.
   * 와일드카드(**)를 사용하여 하위 디렉토리까지 검색할 수 있습니다.
   *
   * @example ['test-results/**\/*.xml', 'coverage/clover.xml']
   */
  @IsArray()
  @IsString({ each: true })
  files!: string[];

  /**
   * 리포트 파일 형식
   *
   * 수집할 리포트 파일의 형식을 지정합니다.
   * AWS CodeBuild에서 지원하는 표준 리포트 형식 중 하나를 선택해야 합니다.
   *
   * @default 'JUNITXML'
   */
  @IsOptional()
  @IsString()
  'file-format'?:
    | 'JUNITXML' /** JUnit XML 형식 (기본값) */
    | 'CUCUMBERJSON' /** Cucumber JSON 형식 */
    | 'TESTNGXML' /** TestNG XML 형식 */
    | 'CLOVERXML' /** Clover XML 코드 커버리지 형식 */
    | 'VISUALSTUDIOTRX' /** Visual Studio TRX 형식 */
    | 'JACOCOXML' /** JaCoCo XML 코드 커버리지 형식 */
    | 'NUNITXML' /** NUnit XML 형식 */
    | 'NUNIT3XML'; /** NUnit3 XML 형식 */

  /**
   * 리포트 기준 디렉토리
   *
   * 리포트 파일 경로의 기준이 되는 디렉토리입니다.
   * 이 경로를 기준으로 상대 경로가 해석됩니다.
   *
   * @example 'build/reports' - build/reports 디렉토리를 기준으로 files 경로를 해석
   */
  @IsOptional()
  @IsString()
  'base-directory'?: string;

  /**
   * 경로 정보 제거 여부
   *
   * true로 설정하면 리포트에서 파일 경로 정보를 제거하고 파일명만 표시합니다.
   * 보안상 민감한 경로 정보를 숨기거나 리포트를 간소화할 때 사용합니다.
   *
   * @default false
   */
  @IsOptional()
  discard_paths?: boolean;
}
/**
 * CodeBuild 빌드 시작 요청 메인 DTO
 *
 * 사용자가 제공한 JSON 형태의 빌드 설정을 받아서 AWS CodeBuild buildspec.yml로
 * 변환하기 위한 최상위 데이터 전송 객체입니다.
 *
 * @description
 * 이 DTO는 AWS CodeBuild의 buildspec.yml 파일 구조를 JSON으로 표현한 것입니다.
 * 다음과 같은 주요 섹션들을 포함합니다:
 *
 * 1. **기본 설정**: version, runtime 등 빌드 환경 설정
 * 2. **빌드 단계**: install, pre_build, build, post_build, finally 명령어들
 * 3. **아티팩트**: 빌드 결과물로 보존할 파일들
 * 4. **환경 변수**: 빌드 시 사용할 환경 변수들
 * 5. **캐싱**: 빌드 속도 향상을 위한 캐시 설정
 * 6. **리포트**: 테스트 결과, 코드 커버리지 리포트 설정
 * 7. **고급 옵션**: 실패 처리, 시크릿 관리 등
 *
 * @validation
 * - commands 필드는 필수이며, 최소한 하나의 빌드 단계는 포함해야 합니다
 * - 모든 문자열 배열은 빈 배열이 허용되지만, 각 요소는 유효한 문자열이어야 합니다
 * - environment_variables와 secrets은 키-값 쌍의 객체 형태여야 합니다
 *
 * @example
 * ```typescript
 * // 기본적인 Node.js 프로젝트 빌드 설정
 * const basicBuild: StartBuildDto = {
 *   version: '0.2',
 *   runtime: 'node:18',
 *   commands: {
 *     install: ['npm ci'],
 *     build: ['npm run build'],
 *     post_build: ['npm test']
 *   },
 *   artifacts: ['dist/**', 'package.json'],
 *   environment_variables: {
 *     NODE_ENV: 'production',
 *     API_URL: 'https://api.example.com'
 *   }
 * };
 *
 * // 고급 기능을 포함한 빌드 설정
 * const advancedBuild: StartBuildDto = {
 *   version: '0.2',
 *   runtime: 'node:18',
 *   commands: {
 *     install: [
 *       'apt-get update',
 *       'apt-get install -y git',
 *       'npm ci'
 *     ],
 *     pre_build: [
 *       'echo "Starting build process..."',
 *       'npm run lint'
 *     ],
 *     build: [
 *       'npm run build:prod',
 *       'npm run test:coverage'
 *     ],
 *     post_build: [
 *       'echo "Build completed successfully"'
 *     ],
 *     finally: [
 *       'echo "Cleaning up..."',
 *       'rm -rf node_modules/.cache'
 *     ]
 *   },
 *   artifacts: ['dist/**', 'coverage/**'],
 *   environment_variables: {
 *     NODE_ENV: 'production',
 *     BUILD_NUMBER: '$CODEBUILD_BUILD_NUMBER'
 *   },
 *   cache: {
 *     paths: ['/root/.npm', 'node_modules/**']
 *   },
 *   reports: {
 *     jest_reports: {
 *       files: ['coverage/clover.xml'],
 *       'file-format': 'CLOVERXML',
 *       'base-directory': 'coverage'
 *     }
 *   },
 *   on_failure: 'CONTINUE',
 *   secrets: {
 *     API_KEY: '/myapp/api_key',
 *     DB_PASSWORD: '/myapp/db_password'
 *   }
 * };
 * ```
 *
 * @see {@link BuildCommandsDto} - 빌드 단계별 명령어 설정
 * @see {@link BuildCacheDto} - 빌드 캐시 설정
 * @see {@link BuildReportDto} - 리포트 설정
 * @see {@link https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html} AWS CodeBuild Buildspec 레퍼런스
 */
export class StartBuildDto {
  /**
   * Buildspec 버전
   *
   * AWS CodeBuild buildspec 파일의 버전을 지정합니다.
   * 현재 AWS에서 권장하는 최신 버전은 '0.2'입니다.
   *
   * @default '0.2'
   * @example '0.2'
   */
  @IsOptional()
  @IsString()
  version?: string;

  /**
   * 빌드 환경 런타임
   *
   * 빌드에 사용할 런타임 환경을 지정합니다.
   * AWS CodeBuild에서 제공하는 표준 런타임 이미지 중 하나를 선택할 수 있습니다.
   *
   * @example 'node:18' - Node.js 18.x 환경
   * @example 'python:3.9' - Python 3.9 환경
   * @example 'java:corretto11' - Amazon Corretto 11 Java 환경
   * @example 'golang:1.19' - Go 1.19 환경
   * @example 'dotnet:6' - .NET 6 환경
   * @example 'php:8.1' - PHP 8.1 환경
   */
  @IsOptional()
  @IsString()
  runtime?: string;

  /**
   * 빌드 단계별 명령어 설정
   *
   * 빌드의 각 단계(install, pre_build, build, post_build, finally)에서
   * 실행할 명령어들을 정의합니다. 이는 buildspec.yml의 phases 섹션에 해당합니다.
   *
   * @required 이 필드는 필수이며, 최소한 하나의 빌드 단계는 포함해야 합니다
   */
  @ValidateNested()
  @Type(() => BuildCommandsDto)
  commands!: BuildCommandsDto;

  /**
   * 빌드 아티팩트 경로
   *
   * 빌드 완료 후 보존하고 다운로드할 수 있도록 할 파일이나 디렉토리의 경로들입니다.
   * glob 패턴을 사용하여 여러 파일을 한번에 지정할 수 있습니다.
   *
   * @example ['dist/**', 'build/*.jar', 'package.json']
   * @example ['**\/*.zip', 'reports/**', 'logs/build.log']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artifacts?: string[];

  /**
   * 환경 변수 설정
   *
   * 빌드 프로세스에서 사용할 환경 변수들을 키-값 쌍으로 정의합니다.
   * AWS CodeBuild 내장 환경 변수도 값으로 참조할 수 있습니다.
   *
   * @example
   * {
   *   NODE_ENV: 'production',
   *   API_URL: 'https://api.example.com',
   *   BUILD_NUMBER: '$CODEBUILD_BUILD_NUMBER',
   *   COMMIT_ID: '$CODEBUILD_RESOLVED_SOURCE_VERSION'
   * }
   */
  @IsOptional()
  @IsObject()
  environment_variables?: Record<string, string>;

  /**
   * 빌드 캐시 설정
   *
   * 빌드 시간 단축을 위해 캐싱할 파일이나 디렉토리를 설정합니다.
   * 주로 의존성 패키지, 빌드 결과물 등을 캐싱하여 subsequent 빌드의 속도를 향상시킵니다.
   *
   * @see {@link BuildCacheDto}
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => BuildCacheDto)
  cache?: BuildCacheDto;

  /**
   * 테스트 리포트 설정
   *
   * 빌드 중 생성되는 테스트 결과, 코드 커버리지 등의 리포트를 수집하고 표시하기 위한 설정입니다.
   * 여러 개의 리포트를 설정할 수 있으며, 각각 고유한 이름을 가져야 합니다.
   *
   * @example
   * {
   *   jest_tests: {
   *     files: ['test-results/**\/*.xml'],
   *     'file-format': 'JUNITXML'
   *   },
   *   coverage_report: {
   *     files: ['coverage/clover.xml'],
   *     'file-format': 'CLOVERXML'
   *   }
   * }
   *
   * @see {@link BuildReportDto}
   */
  @IsOptional()
  @IsObject()
  reports?: Record<string, BuildReportDto>;

  /**
   * 빌드 실패 시 동작 설정
   *
   * 빌드가 실패했을 때의 동작 방식을 설정합니다.
   *
   * @default 'ABORT'
   * @param 'ABORT' - 빌드 실패 시 즉시 중단 (기본값)
   * @param 'CONTINUE' - 빌드 실패해도 가능한 단계까지 계속 진행
   */
  @IsOptional()
  @IsString()
  on_failure?: 'ABORT' | 'CONTINUE';

  /**
   * AWS Secrets Manager 시크릿 설정
   *
   * 빌드에서 사용할 민감한 정보(API 키, 비밀번호 등)를 AWS Secrets Manager에서
   * 안전하게 가져와 환경 변수로 설정합니다.
   *
   * @description
   * 키는 빌드 환경에서 사용할 환경 변수 이름이고,
   * 값은 AWS Secrets Manager의 시크릿 경로입니다.
   *
   * @security
   * 시크릿 값들은 빌드 로그에 노출되지 않으며, AWS IAM 권한을 통해 접근이 제어됩니다.
   *
   * @example
   * {
   *   DATABASE_PASSWORD: '/myapp/prod/db_password',
   *   API_SECRET_KEY: '/myapp/external_api/secret_key',
   *   JWT_PRIVATE_KEY: '/myapp/auth/jwt_private_key'
   * }
   *
   * @see {@link https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec.env.secrets-manager} AWS CodeBuild Secrets Manager 통합
   */
  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;
}
