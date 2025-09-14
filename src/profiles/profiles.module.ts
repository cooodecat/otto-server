import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
