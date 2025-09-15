import { Module } from '@nestjs/common';
import { CodeBuildController } from './codebuild.controller';
import { CodeBuildService } from './codebuild.service';

@Module({
  controllers: [CodeBuildController],
  providers: [CodeBuildService],
  exports: [CodeBuildService],
})
export class CodeBuildModule {}
