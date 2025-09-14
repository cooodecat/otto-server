import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { SupabaseService } from './supabase.service';
import { SupabaseJwtStrategy } from './strategies/supabase-jwt.strategy';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'supabase-jwt' }),
    JwtModule.register({}),
  ],
  providers: [SupabaseService, SupabaseJwtStrategy, SupabaseAuthGuard],
  exports: [SupabaseService, SupabaseAuthGuard],
})
export class SupabaseModule {}
