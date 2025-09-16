import { Module } from '@nestjs/common';
import { ProjectController } from './controllers/project.controller';
import { ProjectService } from './services/project.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CodeBuildModule } from '../codebuild/codebuild.module';

@Module({
  imports: [SupabaseModule, CodeBuildModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectsModule {}
