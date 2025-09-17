import { Module, forwardRef } from '@nestjs/common';
import { CodeBuildController } from './codebuild.controller';
import { CodeBuildService } from './codebuild.service';
import { BuildsModule } from '../builds/builds.module';

/**
 * CodeBuild 모듈
 *
 * AWS CodeBuild를 사용한 멀티테넌트 CI/CD 빌드 시스템을 제공합니다.
 * 각 사용자가 독립적인 빌드 환경에서 프로젝트를 빌드할 수 있도록 지원하며,
 * 모든 빌드 실행 이력과 단계별 상세 정보를 데이터베이스에 저장합니다.
 *
 * @description
 * 이 모듈은 다음과 같은 기능을 제공합니다:
 * - JSON 형태의 빌드 설정을 AWS CodeBuild buildspec.yml로 자동 변환
 * - 사용자별 독립된 CodeBuild 프로젝트에서 빌드 실행
 * - 실시간 빌드 상태 조회 및 모니터링
 * - 빌드 이력 및 단계별 실행 정보 자동 저장
 * - 환경변수, 아티팩트, 캐시 등 고급 빌드 설정 지원
 *
 * @dependencies
 * - BuildsModule: 빌드 실행 이력과 단계별 상세 정보 저장
 *
 * @example
 * ```typescript
 * // 다른 모듈에서 CodeBuildService 사용
 * @Module({
 *   imports: [CodeBuildModule],
 *   // ...
 * })
 * export class SomeModule {
 *   constructor(private readonly codeBuildService: CodeBuildService) {}
 * }
 * ```
 *
 * @see {@link CodeBuildController} - REST API 엔드포인트
 * @see {@link CodeBuildService} - 핵심 빌드 로직
 * @since 1.0.0
 */
@Module({
  // 의존성 모듈 가져오기
  imports: [
    forwardRef(() => BuildsModule), // 빌드 이력 저장을 위한 모듈 (순환 의존성 해결)
  ],
  // HTTP 요청을 처리하는 컨트롤러
  controllers: [CodeBuildController],
  // 비즈니스 로직을 담당하는 서비스
  providers: [CodeBuildService],
  // 다른 모듈에서 사용할 수 있도록 내보내는 서비스
  exports: [CodeBuildService],
})
export class CodeBuildModule {}
