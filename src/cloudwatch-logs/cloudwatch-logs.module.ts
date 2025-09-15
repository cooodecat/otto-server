import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudWatchLogsController } from './cloudwatch-logs.controller';
import { CloudWatchLogsService } from './cloudwatch-logs.service';
import { CloudWatchLogsRetryService } from './cloudwatch-logs-retry.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [CloudWatchLogsController],
  providers: [CloudWatchLogsService, CloudWatchLogsRetryService],
  exports: [CloudWatchLogsService],
})
export class CloudWatchLogsModule {}
