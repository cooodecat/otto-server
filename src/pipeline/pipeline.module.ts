import { Module, forwardRef } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { PipelineExecutorService } from './pipeline-executor.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CodeBuildModule } from '../codebuild/codebuild.module';
import { CodeDeployModule } from '../codedeploy/codedeploy.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => CodeBuildModule),
    CodeDeployModule,
  ],
  controllers: [PipelineController],
  providers: [PipelineService, PipelineExecutorService],
  exports: [PipelineService, PipelineExecutorService],
})
export class PipelineModule {}
