import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  GitHubInstallationsResponse,
  GitHubInstallUrlResponse,
  GitHubStatusResponse,
  GitHubRepositoriesResponse,
  GitHubBranchesResponse,
  GitHubInstallation,
  GitHubRepository,
  GitHubBranch,
} from './dto/github-installation.dto';

@Injectable()
export class GithubIntegrationService {
  private readonly logger = new Logger(GithubIntegrationService.name);
  private readonly appId: string;
  private readonly privateKey: string;
  private readonly frontendUrl: string;

  constructor(private readonly supabaseService: SupabaseService) {
    this.appId = process.env.OTTO_GITHUB_APP_ID || '';
    this.privateKey = (process.env.OTTO_GITHUB_APP_PRIVATE_KEY || '').replace(
      /\\n/g,
      '\n',
    );
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (!this.appId || !this.privateKey) {
      throw new Error('GitHub App credentials not configured');
    }
  }

  /**
   * 사용자의 GitHub 설치 목록 조회
   */
  async getUserInstallations(
    userId: string,
  ): Promise<GitHubInstallationsResponse> {
    try {
      const { data: installations, error } = await this.supabaseService
        .getClient()
        .from('github_installations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        this.logger.error('Failed to fetch installations:', error);
        throw new BadRequestException('Failed to fetch installations');
      }

      const typedInstallations = this.validateInstallations(installations);

      return {
        installations: typedInstallations,
        totalInstallations: typedInstallations.length,
      };
    } catch (error) {
      this.logger.error('Error in getUserInstallations:', error);
      throw error;
    }
  }

  /**
   * GitHub 설치 URL 생성
   */
  getGithubInstallUrl(userId: string): GitHubInstallUrlResponse {
    try {
      const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
      const installUrl = `https://github.com/apps/codecat-otto-dev/installations/new?state=${state}`;

      return {
        installUrl,
        state,
      };
    } catch (error) {
      this.logger.error('Error generating install URL:', error);
      throw new BadRequestException('Failed to generate install URL');
    }
  }

  /**
   * GitHub 설치 상태 확인
   */
  async getGithubStatus(userId: string): Promise<GitHubStatusResponse> {
    try {
      const { data: installations, error } = await this.supabaseService
        .getClient()
        .from('github_installations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        this.logger.error('Failed to fetch installations:', error);
        throw new BadRequestException('Failed to fetch installations');
      }

      const { data: projects } = await this.supabaseService
        .getClient()
        .from('projects')
        .select('project_id')
        .eq('user_id', userId);

      const typedInstallations = this.validateInstallations(installations);

      return {
        hasInstallation: typedInstallations.length > 0,
        totalInstallations: typedInstallations.length,
        totalConnectedProjects: projects?.length || 0,
        installations: typedInstallations,
      };
    } catch (error) {
      this.logger.error('Error in getGithubStatus:', error);
      throw error;
    }
  }

  /**
   * 설치된 저장소 목록 조회
   */
  async getRepositories(
    userId: string,
    installationId: string,
  ): Promise<GitHubRepositoriesResponse> {
    try {
      // 설치 권한 확인
      const { data: installation, error: installError } =
        await this.supabaseService
          .getClient()
          .from('github_installations')
          .select('*')
          .eq('user_id', userId)
          .eq('installation_id', installationId)
          .eq('is_active', true)
          .single();

      if (installError || !installation) {
        throw new NotFoundException('Installation not found');
      }

      // Octokit 동적 import
      const { Octokit } = await import('@octokit/rest');
      const { createAppAuth } = await import('@octokit/auth-app');

      const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.appId,
          privateKey: this.privateKey,
          installationId: installationId,
        },
      });

      const { data: repos } =
        await octokit.rest.apps.listReposAccessibleToInstallation();

      const repositories = this.validateRepositories(repos.repositories);

      return {
        repositories,
        totalRepositories: repositories.length,
      };
    } catch (error) {
      this.logger.error('Error in getRepositories:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch repositories');
    }
  }

  /**
   * 저장소의 브랜치 목록 조회
   */
  async getBranches(
    userId: string,
    installationId: string,
    repoFullName: string,
  ): Promise<GitHubBranchesResponse> {
    try {
      // 설치 권한 확인
      const { data: installation, error: installError } =
        await this.supabaseService
          .getClient()
          .from('github_installations')
          .select('*')
          .eq('user_id', userId)
          .eq('installation_id', installationId)
          .eq('is_active', true)
          .single();

      if (installError || !installation) {
        throw new NotFoundException('Installation not found');
      }

      // Octokit 동적 import
      const { Octokit } = await import('@octokit/rest');
      const { createAppAuth } = await import('@octokit/auth-app');

      const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.appId,
          privateKey: this.privateKey,
          installationId: installationId,
        },
      });

      const [owner, repo] = repoFullName.split('/');
      if (!owner || !repo) {
        throw new BadRequestException('Invalid repository name format');
      }

      const { data: branches } = await octokit.rest.repos.listBranches({
        owner,
        repo,
      });

      const typedBranches = this.validateBranches(branches);

      return {
        branches: typedBranches,
        totalBranches: typedBranches.length,
      };
    } catch (error) {
      this.logger.error('Error in getBranches:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch branches');
    }
  }

  /**
   * 타입 가드: GitHub 설치 목록 검증
   */
  private validateInstallations(data: unknown): GitHubInstallation[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter((item): item is GitHubInstallation => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as GitHubInstallation).id === 'string' &&
        typeof (item as GitHubInstallation).installation_id === 'string' &&
        typeof (item as GitHubInstallation).user_id === 'string'
      );
    });
  }

  /**
   * 타입 가드: GitHub 저장소 목록 검증
   */
  private validateRepositories(data: unknown[]): GitHubRepository[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter((item): item is GitHubRepository => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as GitHubRepository).id === 'number' &&
        typeof (item as GitHubRepository).name === 'string' &&
        typeof (item as GitHubRepository).full_name === 'string'
      );
    });
  }

  /**
   * 타입 가드: GitHub 브랜치 목록 검증
   */
  private validateBranches(data: unknown[]): GitHubBranch[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter((item): item is GitHubBranch => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as GitHubBranch).name === 'string' &&
        typeof (item as GitHubBranch).protected === 'boolean' &&
        typeof (item as GitHubBranch).commit === 'object' &&
        (item as GitHubBranch).commit !== null
      );
    });
  }

}
