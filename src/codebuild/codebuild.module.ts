import { Module } from '@nestjs/common';
import { CodeBuildController } from './codebuild.controller';
import { CodeBuildService } from './codebuild.service';
import { ProjectsModule } from '../projects/projects.module';

/**
 * CodeBuild 모듈
 *
 * 멀티테넌트 CI/CD 빌드 기능을 제공합니다.
 * ProjectsModule을 import하여 사용자별 프로젝트 정보에 접근할 수 있습니다.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [CodeBuildController],
  providers: [CodeBuildService],
  exports: [CodeBuildService],
})
export class CodeBuildModule {}