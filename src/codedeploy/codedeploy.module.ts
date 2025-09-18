import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CodeDeployService } from './codedeploy.service';
import { CodeDeployController } from './codedeploy.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [ConfigModule, SupabaseModule],
  providers: [CodeDeployService],
  controllers: [CodeDeployController],
  exports: [CodeDeployService],
})
export class CodeDeployModule {}