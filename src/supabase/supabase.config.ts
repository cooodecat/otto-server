import { ConfigService } from '@nestjs/config';

export interface SupabaseConfig {
  url: string;
  key: string;
  jwtSecret: string;
}

export const getSupabaseConfig = (
  configService: ConfigService,
): SupabaseConfig => ({
  url: configService.get<string>('SUPABASE_URL') || '',
  key: configService.get<string>('SUPABASE_ANON_KEY') || '',
  jwtSecret: configService.get<string>('SUPABASE_JWT_SECRET') || '',
});
