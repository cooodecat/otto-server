import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
  Header,
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
  ) {}

  /**
   * @tag github-integration
   * @summary GitHub 설치 목록 조회
   */
  @Get('github-installations')
  @UseGuards(SupabaseAuthGuard)
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
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
    @Query('returnUrl') returnUrl?: string,
  ): GitHubInstallUrlResponse {
    try {
      return this.githubIntegrationService.getGithubInstallUrl(
        req.user.id,
        returnUrl,
      );
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
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
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
  @Get(
    'github-installations/:installationId/repositories/:owner/:repo/branches',
  )
  @UseGuards(SupabaseAuthGuard)
  async getBranches(
    @Req() req: { user: AuthenticatedUser },
    @Param('installationId') installationId: string,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ): Promise<GitHubBranchesResponse> {
    try {
      const repoFullName = `${owner}/${repo}`;
      return await this.githubIntegrationService.getBranches(
        req.user.id,
        installationId,
        repoFullName,
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

  /**
   * @tag github-integration
   * @summary 테스트: 첫 번째 설치의 레포지토리 자동 조회
   */
  @Get('github/test-repos')
  @UseGuards(SupabaseAuthGuard)
  async testGetRepositories(
    @Req() req: { user: AuthenticatedUser },
  ): Promise<any> {
    try {
      this.logger.log(`[testGetRepositories] Testing for user: ${req.user.id}`);

      // 먼저 사용자의 설치 정보 가져오기
      const statusResponse =
        await this.githubIntegrationService.getGithubStatus(req.user.id);

      if (
        !statusResponse.hasInstallation ||
        statusResponse.installations.length === 0
      ) {
        return { error: 'No GitHub installations found' };
      }

      const firstInstallation = statusResponse.installations[0];
      this.logger.log(
        `[testGetRepositories] Using installation: ${firstInstallation.installation_id}`,
      );

      // 첫 번째 설치의 레포지토리 조회
      const reposResponse = await this.githubIntegrationService.getRepositories(
        req.user.id,
        firstInstallation.installation_id,
      );

      return {
        installation: firstInstallation,
        repositories: reposResponse,
      };
    } catch (error) {
      this.logger.error('Error in testGetRepositories:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
