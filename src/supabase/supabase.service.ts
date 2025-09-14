import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabase.config';
import { GitHubUser } from '../types/auth.types';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient<any, any>;

  constructor(private configService: ConfigService) {
    const config = getSupabaseConfig(this.configService);

    if (!config.url || !config.key) {
      this.logger.error('Supabase URL and ANON_KEY must be provided');
      throw new Error('Supabase configuration is missing');
    }

    this.supabase = createClient(config.url, config.key, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
    });

    this.logger.log('Supabase client initialized successfully');
  }

  getClient(): SupabaseClient<any, any> {
    return this.supabase;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();

    if (error) {
      this.logger.error(`Sign out error: ${error.message}`);
      throw error;
    }

    return { message: 'Successfully signed out' };
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.supabase.auth.getUser(accessToken);

    if (error) {
      this.logger.error(`Get user error: ${error.message}`);
      throw error;
    }

    return data;
  }

  /**
   * Validate GitHub OAuth token and get user information
   */
  async validateGitHubToken(
    accessToken: string,
  ): Promise<{ user: User; isGitHubUser: boolean }> {
    try {
      const { data, error } = await this.supabase.auth.getUser(accessToken);

      if (error) {
        this.logger.error(`GitHub token validation error: ${error.message}`);
        throw error;
      }

      if (!data.user) {
        throw new Error('User not found');
      }

      const isGitHubUser = data.user.app_metadata?.provider === 'github';

      this.logger.debug('GitHub token validated', {
        userId: data.user.id,
        provider: data.user.app_metadata?.provider,
        isGitHubUser,
      });

      return { user: data.user, isGitHubUser };
    } catch (error) {
      this.logger.error('Failed to validate GitHub token', error);
      throw error;
    }
  }

  /**
   * Extract GitHub user profile information from Supabase user
   */
  extractGitHubProfile(user: User): GitHubUser | null {
    if (!user || user.app_metadata?.provider !== 'github') {
      return null;
    }

    const userMetadata = (user.user_metadata as Record<string, string>) || {};

    return {
      id: user.id,
      email: user.email || '',
      provider: 'github',
      github_username:
        userMetadata.user_name || userMetadata.preferred_username || '',
      avatar_url: userMetadata.avatar_url || '',
      full_name: userMetadata.full_name || userMetadata.name || '',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || user.created_at,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string) {
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        this.logger.error(`Token refresh error: ${error.message}`);
        throw error;
      }

      this.logger.debug('Token refreshed successfully', {
        userId: data.user?.id,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to refresh token', error);
      throw error;
    }
  }

  /**
   * Get current session information
   */
  async getSession(accessToken: string) {
    try {
      // Note: We use getUser instead of getSession for server-side validation
      // as recommended by Supabase for security reasons
      const { data, error } = await this.supabase.auth.getUser(accessToken);

      if (error) {
        this.logger.error(`Get session error: ${error.message}`);
        throw error;
      }

      return {
        user: data.user,
        access_token: accessToken,
        token_type: 'bearer',
      };
    } catch (error) {
      this.logger.error('Failed to get session', error);
      throw error;
    }
  }

  /**
   * Verify if user has GitHub provider
   */
  isGitHubUser(user: User): boolean {
    return user?.app_metadata?.provider === 'github';
  }
}
