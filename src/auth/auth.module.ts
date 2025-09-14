import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [SupabaseModule, ProfilesModule],
  controllers: [AuthController],
})
export class AuthModule {}
