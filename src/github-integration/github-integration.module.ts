import { Module } from '@nestjs/common';
import { GithubIntegrationController } from './github-integration.controller';
import { GithubIntegrationService } from './github-integration.service';
import { GithubWebhookController } from './github-webhook.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [SupabaseModule, ConfigModule],
  controllers: [GithubIntegrationController, GithubWebhookController],
  providers: [GithubIntegrationService],
  exports: [GithubIntegrationService],
})
export class GithubIntegrationModule {}
