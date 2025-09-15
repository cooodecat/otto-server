import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';
import type { ApiResponse, AuthenticatedUser } from '../types/auth.types';

interface RefreshTokenDto {
  refresh_token: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly profilesService: ProfilesService,
  ) {}

  @Post('signout')
  @UseGuards(SupabaseAuthGuard)
  async signOut() {
    return this.supabaseService.signOut();
  }

  @Get('profile')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(
    @Request()
    req: {
      user: AuthenticatedUser;
      headers?: Record<string, string>;
    },
  ): Promise<ApiResponse> {
    try {
      // Get profile data from database
      const profile = await this.profilesService.getProfileById(req.user.id);

      return {
        success: true,
        data: {
          message: 'Successfully retrieved user profile',
          user: {
            ...req.user,
            profile: profile || undefined,
          },
        },
      };
    } catch (error) {
      this.logger.error('Get profile error', error);
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'PROFILE_ERROR',
          message: 'Failed to get user profile',
        },
      });
    }
  }

  @Get('github/profile')
  @UseGuards(SupabaseAuthGuard)
  async getGitHubProfile(
    @Request()
    req: {
      user: AuthenticatedUser;
      headers?: Record<string, string>;
    },
  ): Promise<ApiResponse> {
    try {
      if (req.user.provider !== 'github') {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'NOT_GITHUB_USER',
            message: 'User is not authenticated via GitHub',
          },
        });
      }

      // Get user token from header for additional Supabase queries if needed
      const authHeader = req.headers?.['authorization'] as string;
      const token = authHeader?.replace('Bearer ', '');

      if (token) {
        const { user } = await this.supabaseService.validateGitHubToken(token);
        const githubProfile = this.supabaseService.extractGitHubProfile(user);

        return {
          success: true,
          data: githubProfile,
        };
      }

      return {
        success: true,
        data: {
          id: req.user.id,
          email: req.user.email,
          provider: req.user.provider,
          github_username: req.user.githubUsername,
          avatar_url: req.user.avatarUrl,
          full_name: req.user.fullName,
        },
      };
    } catch (error) {
      this.logger.error('Get GitHub profile error', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'GITHUB_PROFILE_ERROR',
          message: 'Failed to get GitHub profile',
        },
      });
    }
  }

  @Post('refresh')
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<ApiResponse> {
    try {
      const { refresh_token } = refreshTokenDto;

      if (!refresh_token) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required',
          },
        });
      }

      const result = await this.supabaseService.refreshToken(refresh_token);

      return {
        success: true,
        data: {
          access_token: result.session?.access_token,
          refresh_token: result.session?.refresh_token,
          expires_in: result.session?.expires_in,
          user: result.user,
        },
      };
    } catch (error) {
      this.logger.error('Refresh token error', error);

      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_ERROR',
          message: 'Failed to refresh token',
        },
      });
    }
  }

  @Get('session')
  @UseGuards(SupabaseAuthGuard)
  async getSession(
    @Request()
    req: {
      user: AuthenticatedUser;
      headers?: Record<string, string>;
    },
  ): Promise<ApiResponse> {
    try {
      const authHeader = req.headers?.['authorization'] as string;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Authorization token is required',
          },
        });
      }

      await this.supabaseService.getSession(token);

      return {
        success: true,
        data: {
          user: req.user,
          session: {
            access_token: token,
            token_type: 'bearer',
            expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          },
        },
      };
    } catch (error) {
      this.logger.error('Get session error', error);
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'SESSION_ERROR',
          message: 'Failed to get session',
        },
      });
    }
  }
}
