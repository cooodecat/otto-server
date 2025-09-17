import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { ConfigService } from '@nestjs/config';

@Controller('github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GitHub Webhook 엔드포인트
   * GitHub App의 모든 이벤트를 수신
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') githubEvent: string,
  ) {
    this.logger.log(`[GitHub Webhook] Received event: ${githubEvent}`);

    // 서명 검증
    const webhookSecret = this.configService.get<string>('OTTO_GITHUB_WEBHOOK_SECRET');
    if (webhookSecret && signature) {
      const isValid = this.verifyWebhookSignature(payload, signature, webhookSecret);
      if (!isValid) {
        this.logger.error('[GitHub Webhook] Invalid signature');
        throw new BadRequestException('Invalid signature');
      }
    }

    try {
      // 이벤트 타입별 처리
      switch (githubEvent) {
        case 'installation':
          await this.handleInstallation(payload);
          break;
        case 'installation_repositories':
          await this.handleInstallationRepositories(payload);
          break;
        case 'push':
          await this.handlePush(payload);
          break;
        case 'pull_request':
          await this.handlePullRequest(payload);
          break;
        default:
          this.logger.log(`[GitHub Webhook] Unhandled event type: ${githubEvent}`);
      }

      return { status: 'ok' };
    } catch (error) {
      this.logger.error('[GitHub Webhook] Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Webhook 서명 검증
   */
  private verifyWebhookSignature(
    payload: any,
    signature: string,
    secret: string,
  ): boolean {
    const hmac = createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    return signature === digest;
  }

  /**
   * Installation 이벤트 처리
   * - created: 새로운 설치
   * - deleted: 설치 제거
   */
  private async handleInstallation(payload: any) {
    const { action, installation, sender } = payload;
    
    this.logger.log(`[GitHub Webhook] Installation ${action}: ${installation.id}`);

    if (action === 'created') {
      // GitHub 사용자 정보로 Otto 사용자 찾기
      const client = this.supabase.getClient();
      
      const { data: users, error: userError } = await client
        .from('users')
        .select('*')
        .or(`github_username.eq.${sender.login},username.eq.${sender.login}`)
        .limit(1);

      if (userError || !users || users.length === 0) {
        this.logger.warn(
          `[GitHub Webhook] User not found for GitHub login: ${sender.login}`,
        );
        return;
      }

      const user = users[0];

      // Installation 정보 저장
      const { data: existingInstall } = await client
        .from('github_installations')
        .select('*')
        .eq('installation_id', String(installation.id))
        .single();

      const installationData = {
        installation_id: String(installation.id),
        user_id: user.id,
        account_login: installation.account.login,
        account_type: installation.account.type,
        repository_selection: installation.repository_selection,
        permissions: installation.permissions || {},
        events: installation.events || [],
        is_active: true,
        created_at: installation.created_at,
        updated_at: installation.updated_at,
      };

      if (existingInstall) {
        // Update existing
        await client
          .from('github_installations')
          .update({
            is_active: true,
            repository_selection: installation.repository_selection,
            permissions: installation.permissions || {},
            events: installation.events || [],
            updated_at: installation.updated_at,
          })
          .eq('installation_id', String(installation.id));
      } else {
        // Create new
        await client
          .from('github_installations')
          .insert(installationData);
      }

      this.logger.log(
        `[GitHub Webhook] Installation saved: ${installation.id} for user: ${user.id}`,
      );
    } else if (action === 'deleted') {
      // Installation 비활성화
      const client = this.supabase.getClient();
      await client
        .from('github_installations')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('installation_id', String(installation.id));

      this.logger.log(`[GitHub Webhook] Installation deactivated: ${installation.id}`);
    }
  }

  /**
   * Installation Repositories 이벤트 처리
   * - added: 저장소 추가
   * - removed: 저장소 제거
   */
  private async handleInstallationRepositories(payload: any) {
    const { action, installation, repositories_added, repositories_removed } = payload;
    
    this.logger.log(
      `[GitHub Webhook] Installation repositories ${action} for installation: ${installation.id}`,
    );

    if (repositories_added && repositories_added.length > 0) {
      this.logger.log(
        `[GitHub Webhook] Repositories added: ${repositories_added
          .map((r: any) => r.full_name)
          .join(', ')}`,
      );
      // 필요시 저장소 정보 저장
    }

    if (repositories_removed && repositories_removed.length > 0) {
      this.logger.log(
        `[GitHub Webhook] Repositories removed: ${repositories_removed
          .map((r: any) => r.full_name)
          .join(', ')}`,
      );
      // 필요시 저장소 정보 제거
    }
  }

  /**
   * Push 이벤트 처리
   */
  private async handlePush(payload: any) {
    const { repository, ref, pusher, commits } = payload;
    
    this.logger.log(
      `[GitHub Webhook] Push to ${repository.full_name} on ${ref} by ${pusher.name}`,
    );

    // 필요시 빌드 트리거 등 처리
  }

  /**
   * Pull Request 이벤트 처리
   */
  private async handlePullRequest(payload: any) {
    const { action, pull_request, repository } = payload;
    
    this.logger.log(
      `[GitHub Webhook] Pull request ${action} on ${repository.full_name}: #${pull_request.number}`,
    );

    // 필요시 PR 빌드 트리거 등 처리
  }
}