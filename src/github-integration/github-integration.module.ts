import { Module } from '@nestjs/common';
import { GithubIntegrationController } from './github-integration.controller';
import { GithubIntegrationService } from './github-integration.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [GithubIntegrationController],
  providers: [GithubIntegrationService],
  exports: [GithubIntegrationService],
})
export class GithubIntegrationModule {}
