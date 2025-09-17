import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Octokit } from '@octokit/rest';
import * as jwt from 'jsonwebtoken';
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

    // PEM 형식 확인
    if (
      !this.privateKey.includes('-----BEGIN RSA PRIVATE KEY-----') &&
      !this.privateKey.includes('-----BEGIN PRIVATE KEY-----')
    ) {
      throw new Error('GitHub App Private Key가 올바른 PEM 형식이 아닙니다');
    }

    this.logger.log('[GitHub Service] 인증 정보 로드 완료:', {
      appId: this.appId,
      privateKeyLength: this.privateKey.length,
      privateKeyStart: this.privateKey.substring(0, 50),
      hasBeginMarker: this.privateKey.includes('-----BEGIN'),
      hasEndMarker: this.privateKey.includes('-----END'),
    });
  }

  private generateJWT(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now,
      exp: now + 600, // 10 minutes
      iss: parseInt(this.appId),
    };

    try {
      this.logger.log('[GitHub Service] JWT 생성 시작:', {
        appId: payload.iss,
        iat: payload.iat,
        exp: payload.exp,
        privateKeyLength: this.privateKey.length,
      });

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
      });

      this.logger.log('[GitHub Service] JWT 생성 성공:', {
        tokenLength: token.length,
        tokenStart: token.substring(0, 30),
      });

      return token;
    } catch (error) {
      this.logger.error('[GitHub Service] JWT 생성 실패:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        privateKeyStart: this.privateKey.substring(0, 50),
      });
      throw new BadRequestException('GitHub App JWT 생성에 실패했습니다');
    }
  }

  private async getInstallationToken(installationId: string): Promise<string> {
    try {
      const jwtToken = this.generateJWT();

      this.logger.log('[GitHub Service] Installation 토큰 요청 시작:', {
        installationId,
        jwtTokenLength: jwtToken.length,
      });

      const octokit = new Octokit({
        auth: jwtToken,
      });

      const { data } = await octokit.rest.apps.createInstallationAccessToken({
        installation_id: parseInt(installationId),
      });

      this.logger.log('[GitHub Service] Installation 토큰 생성 성공:', {
        tokenLength: data.token.length,
        expiresAt: data.expires_at,
      });

      return data.token;
    } catch (error) {
      this.logger.error('[GitHub Service] Installation 토큰 생성 실패:', {
        installationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new BadRequestException(
        `GitHub 설치 ${installationId}에 접근할 수 없습니다. 설치가 유효한지 확인해주세요.`,
      );
    }
  }

  /**
   * GitHub 설치 ID가 유효한지 검증
   */
  async validateInstallationId(installationId: string): Promise<boolean> {
    try {
      // Installation 토큰 생성을 시도하여 유효성 검증
      await this.getInstallationToken(installationId);
      return true;
    } catch (error) {
      this.logger.warn(
        `[validateInstallationId] Installation ${installationId} is invalid:`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      return false;
    }
  }

  /**
   * 데이터베이스에서 유효하지 않은 설치 비활성화
   */
  async deactivateInvalidInstallations(
    userId: string,
  ): Promise<{ deactivated: number; errors: string[] }> {
    this.logger.log(
      `[deactivateInvalidInstallations] Starting validation for user: ${userId}`,
    );

    try {
      // 사용자의 활성 설치 조회
      const { data: installations, error } = await this.supabaseService
        .getClient()
        .from('github_installations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!installations?.length) {
        this.logger.log(
          `[deactivateInvalidInstallations] No active installations found for user ${userId}`,
        );
        return { deactivated: 0, errors: [] };
      }

      let deactivatedCount = 0;
      const errors: string[] = [];

      // 각 설치 ID 유효성 검증
      for (const installation of installations) {
        const installationId = installation.installation_id;

        try {
          const isValid = await this.validateInstallationId(installationId);

          if (!isValid) {
            // 유효하지 않은 설치 비활성화
            const { error: updateError } = await this.supabaseService
              .getClient()
              .from('github_installations')
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq('installation_id', installationId)
              .eq('user_id', userId);

            if (updateError) {
              errors.push(
                `Failed to deactivate ${installationId}: ${updateError.message}`,
              );
            } else {
              this.logger.log(
                `[deactivateInvalidInstallations] Deactivated invalid installation: ${installationId}`,
              );
              deactivatedCount++;
            }
          } else {
            this.logger.log(
              `[deactivateInvalidInstallations] Installation ${installationId} is valid`,
            );
          }
        } catch (error) {
          const errorMsg = `Validation failed for ${installationId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          this.logger.error(`[deactivateInvalidInstallations] ${errorMsg}`);
        }
      }

      this.logger.log(
        `[deactivateInvalidInstallations] Completed validation for user ${userId}:`,
        {
          total: installations.length,
          deactivated: deactivatedCount,
          errors: errors.length,
        },
      );

      return { deactivated: deactivatedCount, errors };
    } catch (error) {
      this.logger.error(
        `[deactivateInvalidInstallations] Failed for user ${userId}:`,
        error,
      );
      throw new Error(
        `Failed to validate installations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * 더미 데이터 패턴으로 설치 삭제 (user_로 시작하는 계정)
   */
  async cleanupDummyInstallations(
    userId: string,
  ): Promise<{ deleted: number; errors: string[] }> {
    this.logger.log(
      `[cleanupDummyInstallations] Starting cleanup for user: ${userId}`,
    );

    try {
      // user_로 시작하는 더미 데이터 조회
      const { data: dummyInstallations, error } = await this.supabaseService
        .getClient()
        .from('github_installations')
        .select('*')
        .eq('user_id', userId)
        .like('account_login', 'user_%');

      if (error) {
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!dummyInstallations?.length) {
        this.logger.log(
          `[cleanupDummyInstallations] No dummy installations found for user ${userId}`,
        );
        return { deleted: 0, errors: [] };
      }

      this.logger.log(
        `[cleanupDummyInstallations] Found ${dummyInstallations.length} dummy installations to delete`,
      );

      const errors: string[] = [];
      let deletedCount = 0;

      // 더미 데이터 삭제
      for (const installation of dummyInstallations) {
        try {
          const { error: deleteError } = await this.supabaseService
            .getClient()
            .from('github_installations')
            .delete()
            .eq('installation_id', installation.installation_id)
            .eq('user_id', userId);

          if (deleteError) {
            errors.push(
              `Failed to delete ${installation.installation_id}: ${deleteError.message}`,
            );
          } else {
            this.logger.log(
              `[cleanupDummyInstallations] Deleted dummy installation: ${installation.installation_id} (${installation.account_login})`,
            );
            deletedCount++;
          }
        } catch (error) {
          const errorMsg = `Delete failed for ${installation.installation_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          this.logger.error(`[cleanupDummyInstallations] ${errorMsg}`);
        }
      }

      this.logger.log(
        `[cleanupDummyInstallations] Completed cleanup for user ${userId}:`,
        {
          found: dummyInstallations.length,
          deleted: deletedCount,
          errors: errors.length,
        },
      );

      return { deleted: deletedCount, errors };
    } catch (error) {
      this.logger.error(
        `[cleanupDummyInstallations] Failed for user ${userId}:`,
        error,
      );
      throw new Error(
        `Failed to cleanup dummy installations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async getInstallationOctokit(
    installationId: string,
  ): Promise<Octokit> {
    const installationToken = await this.getInstallationToken(installationId);
    return new Octokit({
      auth: installationToken,
    });
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
  getGithubInstallUrl(
    userId: string,
    returnUrl?: string,
  ): GitHubInstallUrlResponse {
    try {
      const state = Buffer.from(
        JSON.stringify({
          userId,
          returnUrl: returnUrl || '/projects',
        }),
      ).toString('base64');
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
   * GitHub 설치 상태 확인 (데이터베이스만 조회)
   */
  async getGithubStatus(userId: string): Promise<GitHubStatusResponse> {
    try {
      this.logger.log(
        `[getGithubStatus] Checking installation status for user: ${userId}`,
      );

      const { data: installations, error } = await this.supabaseService
        .getClient()
        .from('github_installations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        this.logger.error('[getGithubStatus] Database error:', error);
        throw new BadRequestException('Failed to fetch GitHub installations');
      }

      this.logger.log(
        `[getGithubStatus] Raw installations found: ${installations?.length || 0}`,
      );

      const typedInstallations = this.validateInstallations(installations);

      const { data: projects } = await this.supabaseService
        .getClient()
        .from('projects')
        .select('project_id')
        .eq('user_id', userId);

      const result = {
        hasInstallation: typedInstallations.length > 0,
        totalInstallations: typedInstallations.length,
        totalConnectedProjects: projects?.length || 0,
        installations: typedInstallations,
      };

      this.logger.log(
        `[getGithubStatus] Result: hasInstallation=${result.hasInstallation}, installations=${result.totalInstallations}`,
      );

      return result;
    } catch (error) {
      this.logger.error('[getGithubStatus] Error:', error);
      throw error;
    }
  }

  /**
   * 설치된 저장소 목록 조회 (특정 installation ID로)
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
        this.logger.error(
          `[getRepositories] Installation not found: ${installationId} for user: ${userId}`,
        );
        throw new NotFoundException('GitHub installation not found');
      }

      this.logger.log(
        `[getRepositories] Found installation: ${installation.account_login} (${installationId})`,
      );

      // Octokit 인스턴스 생성 및 레포지토리 조회
      const octokit = await this.getInstallationOctokit(installationId);
      const { data } =
        await octokit.rest.apps.listReposAccessibleToInstallation();

      this.logger.log(
        `[getRepositories] Found ${data.repositories.length} repositories`,
      );

      const repositories = this.validateRepositories(data.repositories);

      return {
        repositories,
        totalRepositories: repositories.length,
      };
    } catch (error) {
      this.logger.error('[getRepositories] Error:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch repositories');
    }
  }

  /**
   * 사용자의 모든 설치된 레포지토리 조회 (새로운 API)
   */
  async getAllUserRepositories(
    userId: string,
  ): Promise<GitHubRepositoriesResponse> {
    try {
      this.logger.log(
        `[getAllUserRepositories] Getting all repositories for user: ${userId}`,
      );

      // 사용자의 모든 활성 설치 조회
      const { data: installations, error } = await this.supabaseService
        .getClient()
        .from('github_installations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        this.logger.error('[getAllUserRepositories] Database error:', error);
        throw new BadRequestException('Failed to fetch GitHub installations');
      }

      if (!installations || installations.length === 0) {
        this.logger.log('[getAllUserRepositories] No installations found');
        return {
          repositories: [],
          totalRepositories: 0,
        };
      }

      const typedInstallations = this.validateInstallations(installations);

      if (typedInstallations.length === 0) {
        this.logger.log(
          '[getAllUserRepositories] No valid installations after validation',
        );
        return {
          repositories: [],
          totalRepositories: 0,
        };
      }

      this.logger.log(
        `[getAllUserRepositories] Found ${typedInstallations.length} valid installations`,
      );

      // 각 설치에서 레포지토리 조회
      const allRepositories: GitHubRepository[] = [];

      for (const installation of typedInstallations) {
        try {
          this.logger.log(
            `[getAllUserRepositories] Fetching repos for installation: ${installation.installation_id}`,
          );

          const octokit = await this.getInstallationOctokit(
            installation.installation_id,
          );
          const { data } =
            await octokit.rest.apps.listReposAccessibleToInstallation();

          const repositories = this.validateRepositories(data.repositories);
          allRepositories.push(...repositories);

          this.logger.log(
            `[getAllUserRepositories] Added ${repositories.length} repos from ${installation.account_login}`,
          );
        } catch (installationError) {
          this.logger.warn(
            `[getAllUserRepositories] Failed to fetch repos for installation ${installation.installation_id}:`,
            installationError instanceof Error
              ? installationError.message
              : 'Unknown error',
          );
          // 개별 설치 실패 시 계속 진행
        }
      }

      this.logger.log(
        `[getAllUserRepositories] Total repositories found: ${allRepositories.length}`,
      );

      return {
        repositories: allRepositories,
        totalRepositories: allRepositories.length,
      };
    } catch (error) {
      this.logger.error('[getAllUserRepositories] Error:', error);
      throw error;
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

      const [owner, repo] = repoFullName.split('/');
      if (!owner || !repo) {
        throw new BadRequestException('Invalid repository name format');
      }

      this.logger.log('[GitHub Service] getBranches 시작:', {
        installationId,
        repoFullName,
        owner,
        repo,
      });

      // otto-handler 방식으로 Octokit 인스턴스 생성
      const octokit = await this.getInstallationOctokit(installationId);

      const { data: branches } = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });

      this.logger.log('[GitHub Service] Branches 조회 성공:', {
        repoFullName,
        branchCount: branches.length,
      });

      const typedBranches = this.validateBranches(branches);

      return {
        branches: typedBranches,
        totalBranches: typedBranches.length,
      };
    } catch (error) {
      this.logger.error('[GitHub Service] Error fetching branches:', {
        installationId,
        repoFullName,
        error:
          error instanceof Error
            ? {
                message: error.message,
                name: error.name,
              }
            : error,
      });
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `${repoFullName}의 브랜치 목록을 가져오는데 실패했습니다`,
      );
    }
  }

  /**
   * 타입 가드: GitHub 설치 목록 검증 및 매핑
   * 데이터베이스 필드를 Octokit에서 사용할 수 있는 형태로 변환
   */
  private validateInstallations(data: unknown): GitHubInstallation[] {
    if (!Array.isArray(data)) {
      this.logger.warn(
        '[validateInstallations] Data is not an array:',
        typeof data,
      );
      return [];
    }

    this.logger.log(
      `[validateInstallations] Processing ${data.length} raw installations`,
    );

    // 첫 번째 아이템 구조 상세 로깅
    if (data.length > 0) {
      this.logger.log('[validateInstallations] First item structure:', {
        keys: Object.keys(data[0] || {}),
        sample: data[0],
        type: typeof data[0],
      });
    }

    const result: GitHubInstallation[] = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];

      if (typeof item !== 'object' || item === null) {
        this.logger.warn(
          `[validateInstallations] Item ${i} is not an object:`,
          item,
        );
        continue;
      }

      // 실제 데이터베이스 필드명 확인 및 매핑
      try {
        // 데이터베이스 필드를 GitHubInstallation 인터페이스에 맞게 매핑
        const mappedItem: GitHubInstallation = {
          installation_id:
            this.getFieldValue(item, [
              'installation_id',
              'installationId',
              'github_installation_id',
            ]) || '',
          user_id: this.getFieldValue(item, ['user_id', 'userId']) || '',
          account_id:
            this.getFieldValue(item, [
              'account_id',
              'accountId',
              'github_account_id',
            ]) || '',
          account_login:
            this.getFieldValue(item, [
              'account_login',
              'accountLogin',
              'github_login',
              'login',
            ]) || '',
          account_type:
            this.getFieldValue(item, ['account_type', 'accountType', 'type']) ||
            'Organization',
          github_installation_id:
            this.getFieldValue(item, [
              'github_installation_id',
              'installation_id',
              'installationId',
            ]) || '',
          is_active:
            this.getBooleanFieldValue(item, [
              'is_active',
              'isActive',
              'active',
            ]) ?? true,
          created_at:
            this.getFieldValue(item, ['created_at', 'createdAt', 'created']) ||
            new Date().toISOString(),
          updated_at:
            this.getFieldValue(item, ['updated_at', 'updatedAt', 'updated']) ||
            new Date().toISOString(),
        };

        // 필수 필드 검증
        if (
          mappedItem.installation_id &&
          mappedItem.user_id &&
          mappedItem.account_login
        ) {
          result.push(mappedItem);
          this.logger.log(
            `[validateInstallations] Successfully mapped item ${i}:`,
            {
              installation_id: mappedItem.installation_id,
              account_login: mappedItem.account_login,
            },
          );
        } else {
          this.logger.warn(
            `[validateInstallations] Item ${i} missing required fields:`,
            {
              installation_id: mappedItem.installation_id,
              user_id: mappedItem.user_id,
              account_login: mappedItem.account_login,
              originalKeys: Object.keys(item),
            },
          );
        }
      } catch (error) {
        this.logger.error(
          `[validateInstallations] Error mapping item ${i}:`,
          error,
        );
      }
    }

    this.logger.log(
      `[validateInstallations] Successfully validated ${result.length} out of ${data.length} installations`,
    );
    return result;
  }

  /**
   * 여러 가능한 필드명에서 값을 찾는 헬퍼 함수
   */
  private getFieldValue(
    item: any,
    possibleFields: string[],
  ): string | undefined {
    for (const field of possibleFields) {
      if (item[field] !== undefined && item[field] !== null) {
        return String(item[field]);
      }
    }
    return undefined;
  }

  /**
   * 불린 값을 찾는 헬퍼 함수
   */
  private getBooleanFieldValue(
    item: any,
    possibleFields: string[],
  ): boolean | undefined {
    for (const field of possibleFields) {
      if (item[field] !== undefined && item[field] !== null) {
        return Boolean(item[field]);
      }
    }
    return undefined;
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
