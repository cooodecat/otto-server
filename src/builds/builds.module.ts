import { Module } from '@nestjs/common';
import { BuildsController } from './builds.controller';
import { BuildsService } from './builds.service';
import { SupabaseModule } from '../supabase/supabase.module';

/**
 * 빌드 이력 관리 모듈
 *
 * CodeBuild 실행 이력을 저장하고 조회하는 기능을 제공합니다.
 * SupabaseModule을 import하여 데이터베이스에 접근할 수 있습니다.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [BuildsController],
  providers: [BuildsService],
  exports: [BuildsService],
})
export class BuildsModule {}
