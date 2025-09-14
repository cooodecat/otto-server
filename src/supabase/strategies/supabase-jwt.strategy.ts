import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseService } from '../supabase.service';
import { getSupabaseConfig } from '../supabase.config';
import { SupabaseJwtPayload, AuthenticatedUser } from '../../types/auth.types';

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(
  Strategy,
  'supabase-jwt',
) {
  private readonly logger = new Logger(SupabaseJwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const config = getSupabaseConfig(configService);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
      algorithms: ['HS256'],
    });
  }

  validate(payload: SupabaseJwtPayload): AuthenticatedUser {
    this.logger.debug('Validating JWT payload', {
      sub: payload.sub,
      role: payload.role,
    });

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentTime) {
      throw new UnauthorizedException('Token expired');
    }

    try {
      // Extract provider information
      const provider = payload.app_metadata?.provider || 'email';
      const isGitHubAuth = provider === 'github';

      // Extract user metadata (GitHub OAuth specific)
      const userMetadata = payload.user_metadata || {};

      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role || 'authenticated',
        provider,
      };

      // Add GitHub-specific information if available
      if (isGitHubAuth) {
        authenticatedUser.githubUsername =
          userMetadata.user_name || userMetadata.preferred_username;
        authenticatedUser.avatarUrl = userMetadata.avatar_url;
        authenticatedUser.fullName =
          userMetadata.full_name || userMetadata.name;

        this.logger.debug('GitHub OAuth user validated', {
          id: authenticatedUser.id,
          username: authenticatedUser.githubUsername,
        });
      }

      return authenticatedUser;
    } catch (error) {
      this.logger.error('Token validation failed', error);
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
