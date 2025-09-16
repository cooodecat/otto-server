import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';
import { GithubIntegrationService } from './github-integration.service';
import type { AuthenticatedUser } from '../types/auth.types';
import type {
  GitHubInstallationsResponse,
  GitHubInstallUrlResponse,
  GitHubStatusResponse,
  GitHubRepositoriesResponse,
  GitHubBranchesResponse,
} from './dto/github-installation.dto';

@Controller('projects')
export class GithubIntegrationController {
  private readonly logger = new Logger(GithubIntegrationController.name);

  constructor(
    private readonly githubIntegrationService: GithubIntegrationService,
  ) { }


  /**
   * @tag github-integration
   * @summary GitHub 설치 목록 조회
   */
  @Get('github-installations')
  @UseGuards(SupabaseAuthGuard)
  async getGitHubInstallations(
    @Req() req: { user: AuthenticatedUser },
  ): Promise<GitHubInstallationsResponse> {
    try {
      return await this.githubIntegrationService.getUserInstallations(
        req.user.id,
      );
    } catch (error) {
      this.logger.error('Error in getGitHubInstallations:', error);
      throw new HttpException(
        'Failed to fetch GitHub installations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag github-integration
   * @summary GitHub 설치 URL 생성
   */
  @Get('github/install-url')
  @UseGuards(SupabaseAuthGuard)
  getGithubInstallUrl(
    @Req() req: { user: AuthenticatedUser },
  ): GitHubInstallUrlResponse {
    try {
      return this.githubIntegrationService.getGithubInstallUrl(req.user.id);
    } catch (error) {
      this.logger.error('Error in getGithubInstallUrl:', error);
      throw new HttpException(
        'Failed to generate GitHub install URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag github-integration
   * @summary GitHub 설치 상태 확인
   */
  @Get('github/status')
  @UseGuards(SupabaseAuthGuard)
  async getGithubStatus(
    @Req() req: { user: AuthenticatedUser },
  ): Promise<GitHubStatusResponse> {
    try {
      return await this.githubIntegrationService.getGithubStatus(req.user.id);
    } catch (error) {
      this.logger.error('Error in getGithubStatus:', error);
      throw new HttpException(
        'Failed to fetch GitHub status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag github-integration
   * @summary 설치된 저장소 목록 조회
   */
  @Get('github-installations/:installationId/repositories')
  @UseGuards(SupabaseAuthGuard)
  async getRepositories(
    @Req() req: { user: AuthenticatedUser },
    @Param('installationId') installationId: string,
  ): Promise<GitHubRepositoriesResponse> {
    try {
      return await this.githubIntegrationService.getRepositories(
        req.user.id,
        installationId,
      );
    } catch (error) {
      this.logger.error('Error in getRepositories:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch repositories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag github-integration
   * @summary 저장소의 브랜치 목록 조회
   */
  @Get('github-installations/:installationId/repositories/:repo/branches')
  @UseGuards(SupabaseAuthGuard)
  async getBranches(
    @Req() req: { user: AuthenticatedUser },
    @Param('installationId') installationId: string,
    @Param('repo') repo: string,
  ): Promise<GitHubBranchesResponse> {
    try {
      return await this.githubIntegrationService.getBranches(
        req.user.id,
        installationId,
        repo,
      );
    } catch (error) {
      this.logger.error('Error in getBranches:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch branches',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
