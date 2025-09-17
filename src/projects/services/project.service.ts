import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';
import { CodeBuildService } from '../../codebuild/codebuild.service';
import type {
  ProjectsResponse,
  ProjectDetailResponse,
  CreateProjectWithGithubRequest,
  CreateProjectWithGithubResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  DeleteProjectResponse,
  RetryCodeBuildResponse,
  Project,
} from '../dto/project.dto';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly codebuildService: CodeBuildService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 사용자 프로젝트 목록 조회
   */
  async getUserProjects(userId: string): Promise<ProjectsResponse> {
    try {
      this.logger.log(
        `[ProjectService] getUserProjects called for userId: ${userId}`,
      );

      // 사용자의 프로젝트 조회
      const { data: projects, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select(
          `
          project_id,
          user_id,
          name,
          description,
          github_owner,
          github_repo_id,
          github_repo_name,
          github_repo_url,
          selected_branch,
          created_at,
          updated_at,
          codebuild_status,
          codebuild_project_name,
          codebuild_error_message
        `,
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        this.logger.error('Failed to fetch projects:', error);
        throw new BadRequestException('Failed to fetch projects');
      }

      this.logger.log(
        `[ProjectService] Found ${projects?.length || 0} projects for userId: ${userId}`,
      );

      const typedProjects = this.validateProjects(projects);

      return {
        projects: typedProjects,
        totalProjects: typedProjects.length,
      };
    } catch (error) {
      this.logger.error('Error in getUserProjects:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 상세 정보 조회
   */
  async getProjectDetail(
    userId: string,
    projectId: string,
  ): Promise<ProjectDetailResponse> {
    try {
      const { data: project, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select(
          `
          project_id,
          user_id,
          name,
          description,
          github_owner,
          github_repo_id,
          github_repo_name,
          github_repo_url,
          selected_branch,
          created_at,
          updated_at,
          codebuild_status,
          codebuild_project_name,
          codebuild_project_arn,
          cloudwatch_log_group,
          codebuild_error_message
        `,
        )
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single();

      if (error || !project) {
        throw new NotFoundException('Project not found');
      }

      if (!this.validateProject(project)) {
        throw new BadRequestException('Invalid project data');
      }

      return {
        project: project,
      };
    } catch (error) {
      this.logger.error('Error in getProjectDetail:', error);
      throw error;
    }
  }

  /**
   * GitHub 연동 프로젝트 생성
   */
  async createProjectWithGithub(
    userId: string,
    body: CreateProjectWithGithubRequest,
  ): Promise<CreateProjectWithGithubResponse> {
    try {
      const {
        name,
        description,
        installationId,
        githubRepoId,
        githubRepoUrl,
        githubRepoName,
        githubOwner,
        selectedBranch,
      } = body;

      // GitHub Installation 확인 (installation_id 또는 github_installation_id로 조회)
      this.logger.log(
        `[Project Service] GitHub Installation 조회 시작: userId=${userId}, installationId=${installationId}`,
      );

      const { data: installation, error: installError } =
        await this.supabaseService
          .getClient()
          .from('github_installations')
          .select('*')
          .eq('user_id', userId)
          .or(
            `installation_id.eq.${installationId},github_installation_id.eq.${installationId}`,
          )
          .eq('is_active', true)
          .single();

      this.logger.log(`[Project Service] GitHub Installation 조회 결과:`, {
        installation,
        installError: installError?.message,
        hasInstallation: !!installation,
      });

      if (installError || !installation) {
        this.logger.error(`[Project Service] GitHub Installation 조회 실패:`, {
          error: installError?.message,
          userId,
          installationId,
        });
        throw new BadRequestException('유효하지 않은 GitHub 설치 ID입니다');
      }

      // 1. 프로젝트 생성
      const { data: project, error: projectError } = await this.supabaseService
        .getClient()
        .from('projects')
        .insert({
          name,
          description,
          github_owner: githubOwner,
          github_repo_id: githubRepoId,
          github_repo_name: githubRepoName,
          github_repo_url: githubRepoUrl,
          installation_id: installationId,
          user_id: userId,
          selected_branch: selectedBranch || 'main',
          codebuild_status: 'PENDING',
        })
        .select()
        .single();

      if (projectError) {
        this.logger.error('Failed to create project:', projectError);
        throw new BadRequestException('프로젝트 생성에 실패했습니다');
      }

      if (!this.validateProject(project)) {
        throw new BadRequestException('Invalid project data');
      }

      const typedProject = project;

      // 2. CodeBuild 프로젝트 생성
      try {
        const codebuildResult =
          await this.codebuildService.createCodeBuildProject(
            userId,
            name,
            githubRepoUrl,
            selectedBranch || 'main',
          );

        // 3. 성공 시 CodeBuild 정보 업데이트
        const { error: updateError } = await this.supabaseService
          .getClient()
          .from('projects')
          .update({
            codebuild_status: 'CREATED',
            codebuild_project_name: codebuildResult.projectName,
            codebuild_project_arn: codebuildResult.projectArn,
            cloudwatch_log_group: codebuildResult.logGroupName,
          })
          .eq('project_id', typedProject.project_id);

        if (updateError) {
          this.logger.error('Failed to update CodeBuild info:', updateError);
        }

        // 3-1. 기본 파이프라인 자동 생성
        try {
          await this.createDefaultPipeline(
            typedProject.project_id,
            githubRepoName,
            selectedBranch || 'main',
          );
          this.logger.log(
            `Default pipeline created for project: ${typedProject.project_id}`,
          );
        } catch (pipelineError) {
          // 파이프라인 생성 실패는 프로젝트 생성을 막지 않음
          this.logger.warn(
            `Failed to create default pipeline for project ${typedProject.project_id}:`,
            pipelineError,
          );
        }

        return {
          project: {
            ...typedProject,
            codebuild_status: 'CREATED',
            codebuild_project_name: codebuildResult.projectName,
            codebuild_project_arn: codebuildResult.projectArn,
            cloudwatch_log_group: codebuildResult.logGroupName,
          },
        };
      } catch (codebuildError) {
        // 4. CodeBuild 생성 실패 시 상태 업데이트
        const errorMessage =
          codebuildError instanceof Error
            ? codebuildError.message
            : 'Unknown CodeBuild error';

        await this.supabaseService
          .getClient()
          .from('projects')
          .update({
            codebuild_status: 'FAILED',
            codebuild_error_message: errorMessage,
          })
          .eq('project_id', typedProject.project_id);

        return {
          project: {
            ...typedProject,
            codebuild_status: 'FAILED',
            codebuild_error_message: errorMessage,
          },
        };
      }
    } catch (error) {
      this.logger.error('Error in createProjectWithGithub:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 업데이트
   */
  async updateProject(
    userId: string,
    projectId: string,
    updates: UpdateProjectRequest,
  ): Promise<UpdateProjectResponse> {
    try {
      // 먼저 프로젝트가 사용자의 것인지 확인
      const { data: project, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select('project_id')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single();

      if (error || !project) {
        throw new NotFoundException('Project not found');
      }

      // 업데이트 가능한 필드만 추출 (name, description, selected_branch)
      const allowedUpdates: Partial<{
        name: string;
        description: string;
        selected_branch: string;
      }> = {};

      if (updates.name !== undefined) {
        allowedUpdates.name = updates.name;
      }
      if (updates.description !== undefined) {
        allowedUpdates.description = updates.description;
      }
      if (updates.selectedBranch !== undefined) {
        allowedUpdates.selected_branch = updates.selectedBranch;
      }

      // 업데이트할 내용이 없으면 에러
      if (Object.keys(allowedUpdates).length === 0) {
        throw new BadRequestException('No valid fields to update');
      }

      this.logger.log(`Updating project ${projectId} with:`, allowedUpdates);

      // 프로젝트 업데이트
      const { data: updatedProject, error: updateError } =
        await this.supabaseService
          .getClient()
          .from('projects')
          .update(allowedUpdates)
          .eq('project_id', projectId)
          .eq('user_id', userId) // 추가 보안: user_id도 확인
          .select('*')
          .single();

      if (updateError) {
        this.logger.error('Failed to update project:', updateError);
        throw new BadRequestException('Failed to update project');
      }

      if (!this.validateProject(updatedProject)) {
        throw new BadRequestException('Invalid project data');
      }

      return { project: updatedProject };
    } catch (error) {
      this.logger.error('Error in updateProject:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 삭제
   */
  async deleteProject(
    userId: string,
    projectId: string,
  ): Promise<DeleteProjectResponse> {
    try {
      this.logger.log(
        `Starting project deletion - userId: ${userId}, projectId: ${projectId}`,
      );

      // 프로젝트 정보 조회 (CodeBuild 프로젝트명 포함)
      const { data: project, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select('project_id, name, codebuild_project_name')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single();

      if (error || !project) {
        this.logger.error(
          `Project not found - userId: ${userId}, projectId: ${projectId}`,
        );
        throw new NotFoundException('Project not found');
      }

      this.logger.log(`Deleting project: ${project.name}`);

      // CodeBuild 프로젝트 삭제 (실패해도 계속 진행)
      if (project.codebuild_project_name) {
        try {
          this.logger.log(
            `Deleting CodeBuild project: ${project.codebuild_project_name}`,
          );
          await this.codebuildService.deleteCodeBuildProject(
            project.codebuild_project_name,
          );
          this.logger.log(
            `Successfully deleted CodeBuild project: ${project.codebuild_project_name}`,
          );
        } catch (codebuildError) {
          // CodeBuild 삭제 실패는 로그만 남기고 계속 진행
          this.logger.warn(
            `Failed to delete CodeBuild project ${project.codebuild_project_name}, continuing with database deletion:`,
            codebuildError,
          );
        }
      } else {
        this.logger.log(
          'No CodeBuild project name found, skipping CodeBuild deletion',
        );
      }

      // 데이터베이스에서 프로젝트 삭제
      const { error: deleteError } = await this.supabaseService
        .getClient()
        .from('projects')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId); // 추가 보안: user_id도 확인

      if (deleteError) {
        this.logger.error(
          'Failed to delete project from database:',
          deleteError,
        );
        throw new BadRequestException('Failed to delete project');
      }

      this.logger.log(`Successfully deleted project: ${project.name}`);
      return { message: 'Project deleted successfully' };
    } catch (error) {
      this.logger.error('Error in deleteProject:', error);
      throw error;
    }
  }

  /**
   * CodeBuild 재시도
   */
  async retryCodeBuild(
    userId: string,
    projectId: string,
  ): Promise<RetryCodeBuildResponse> {
    try {
      const { data: project, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single();

      if (error || !project) {
        throw new NotFoundException('Project not found');
      }

      if (!this.validateProject(project)) {
        throw new BadRequestException('Invalid project data');
      }

      const typedProject = project;

      // 상태를 PENDING으로 업데이트
      await this.supabaseService
        .getClient()
        .from('projects')
        .update({ codebuild_status: 'PENDING' })
        .eq('project_id', projectId);

      try {
        const codebuildResult =
          await this.codebuildService.createCodeBuildProject(
            userId,
            typedProject.name,
            typedProject.github_repo_url || '',
            typedProject.selected_branch || 'main',
          );

        // 성공 시 CodeBuild 정보 업데이트
        await this.supabaseService
          .getClient()
          .from('projects')
          .update({
            codebuild_status: 'CREATED',
            codebuild_project_name: codebuildResult.projectName,
            codebuild_project_arn: codebuildResult.projectArn,
            cloudwatch_log_group: codebuildResult.logGroupName,
          })
          .eq('project_id', projectId);

        return { message: 'CodeBuild retry successful' };
      } catch (codebuildError) {
        const errorMessage =
          codebuildError instanceof Error
            ? codebuildError.message
            : 'Unknown CodeBuild error';

        await this.supabaseService
          .getClient()
          .from('projects')
          .update({
            codebuild_status: 'FAILED',
            codebuild_error_message: errorMessage,
          })
          .eq('project_id', projectId);

        throw new BadRequestException(
          `CodeBuild retry failed: ${errorMessage}`,
        );
      }
    } catch (error) {
      this.logger.error('Error in retryCodeBuild:', error);
      throw error;
    }
  }

  /**
   * 타입 가드: 프로젝트 목록 검증
   */
  private validateProjects(data: unknown): Project[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter((item): item is Project => {
      return this.validateProject(item);
    });
  }

  /**
   * CodeBuild 프로젝트 생성 (Edge Function 로직 이식)
   */
  private async createCodeBuildProject(
    projectName: string,
    githubRepoUrl: string,
    selectedBranch: string,
    userId: string,
  ): Promise<{
    projectName: string;
    projectArn: string;
    logGroupName: string;
  }> {
    try {
      // 프로젝트명 정리 (특수문자 제거)
      const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9-]/g, '-');
      const codebuildProjectName = `otto-${sanitizedProjectName}-${userId}`;
      const logGroupName = `otto-${sanitizedProjectName}-${userId}-cloudwatch`;
      const artifactsName = `otto-${sanitizedProjectName}-${userId}-artifacts`;

      // AWS 설정
      const region =
        this.configService.get<string>('AWS_REGION') || 'ap-northeast-2';
      const codebuildServiceRole = this.configService.get<string>(
        'AWS_CODEBUILD_SERVICE_ROLE',
      );
      const codebuildArtifactsBucket = this.configService.get<string>(
        'CODEBUILD_ARTIFACTS_BUCKET',
      );

      this.logger.log(`[CodeBuild] AWS 설정 확인:`, {
        region,
        codebuildServiceRole: codebuildServiceRole ? '설정됨' : '누락',
        codebuildArtifactsBucket: codebuildArtifactsBucket ? '설정됨' : '누락',
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')
          ? '설정됨'
          : '누락',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY')
          ? '설정됨'
          : '누락',
      });

      if (!codebuildServiceRole || !codebuildArtifactsBucket) {
        throw new Error(
          'AWS CodeBuild 설정이 누락되었습니다: AWS_CODEBUILD_SERVICE_ROLE, CODEBUILD_ARTIFACTS_BUCKET',
        );
      }

      // 기본 buildspec 생성
      const buildspec = this.createDefaultBuildspec();

      // AWS CodeBuild API 호출을 위한 HTTP 요청
      const payload = {
        name: codebuildProjectName,
        source: {
          type: 'GITHUB',
          location: githubRepoUrl,
          sourceVersion: `refs/heads/${selectedBranch}`,
          buildspec: buildspec,
        },
        artifacts: {
          type: 'S3',
          location: codebuildArtifactsBucket,
          name: artifactsName,
          packaging: 'ZIP',
        },
        environment: {
          type: 'LINUX_CONTAINER',
          image: 'aws/codebuild/standard:7.0',
          computeType: 'BUILD_GENERAL1_MEDIUM',
        },
        serviceRole: codebuildServiceRole,
        timeoutInMinutes: 60,
        logsConfig: {
          cloudWatchLogs: {
            status: 'ENABLED',
            groupName: logGroupName,
          },
        },
      };

      const payloadString = JSON.stringify(payload);
      const host = `codebuild.${region}.amazonaws.com`;
      const path = '/';
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

      this.logger.log(`[CodeBuild] 요청 페이로드:`, {
        projectName: codebuildProjectName,
        githubRepoUrl,
        selectedBranch,
        serviceRole: codebuildServiceRole,
        artifactsBucket: codebuildArtifactsBucket,
        region,
        host,
        amzDate,
      });

      const headers = {
        Host: host,
        'X-Amz-Date': amzDate,
        'X-Amz-Target': 'CodeBuild_20161006.CreateProject',
        'Content-Type': 'application/x-amz-json-1.1',
      };

      // AWS Signature v4 생성
      const authHeader = await this.createSignature(
        'POST',
        host,
        path,
        '',
        headers,
        payloadString,
        'codebuild',
        region,
        this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      );

      const response = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers: {
          ...headers,
          Authorization: authHeader,
        },
        body: payloadString,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('CodeBuild API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          payload: payload,
        });
        throw new Error(
          `CodeBuild project creation failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result = (await response.json()) as {
        project: { arn: string; name: string };
      };

      if (!result.project?.arn || !result.project?.name) {
        throw new Error(
          'CodeBuild project creation failed: missing project data',
        );
      }

      this.logger.log(
        `CodeBuild 프로젝트 생성 완료: ${result.project.name} (ARN: ${result.project.arn})`,
      );

      return {
        projectName: result.project.name,
        projectArn: result.project.arn,
        logGroupName,
      };
    } catch (error) {
      this.logger.error(`CodeBuild 프로젝트 생성 실패: ${projectName}`, error);
      throw error;
    }
  }

  /**
   * 기본 buildspec.yml 생성
   */
  private createDefaultBuildspec(): string {
    return `version: 0.2
phases:
  pre_build:
    commands:
      - echo Installing dependencies...
      - npm install || yarn install || echo "No package manager found"
  build:
    commands:
      - echo Build started
      - npm run build || yarn build || echo "No build script found"
  post_build:
    commands:
      - echo Build completed
artifacts:
  files:
    - '**/*'
  base-directory: '.'
`;
  }

  /**
   * AWS Signature v4 구현
   */
  private async createSignature(
    method: string,
    host: string,
    path: string,
    queryString: string,
    headers: Record<string, string>,
    payload: string,
    service: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ): Promise<string> {
    const algorithm = 'AWS4-HMAC-SHA256';
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

    this.logger.log(`[CodeBuild] Signature 생성:`, {
      dateStamp,
      amzDate,
      region,
      service,
      accessKeyId: accessKeyId ? '설정됨' : '누락',
      secretAccessKey: secretAccessKey ? '설정됨' : '누락',
    });

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    // Canonical request
    const canonicalHeaders =
      Object.keys(headers)
        .sort()
        .map((key) => `${key.toLowerCase()}:${headers[key]}`)
        .join('\n') + '\n';

    const signedHeaders = Object.keys(headers)
      .sort()
      .map((key) => key.toLowerCase())
      .join(';');

    const canonicalRequest = [
      method,
      path,
      queryString,
      canonicalHeaders,
      signedHeaders,
      await this.sha256(payload),
    ].join('\n');

    // String to sign
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      await this.sha256(canonicalRequest),
    ].join('\n');

    // Signing key
    const kDate = await this.hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, 'aws4_request');

    const signature = await this.hmacSha256(kSigning, stringToSign);

    return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${this.arrayBufferToHex(signature)}`;
  }

  /**
   * SHA256 해시 함수
   */
  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.arrayBufferToHex(hashBuffer);
  }

  /**
   * HMAC-SHA256 함수
   */
  private async hmacSha256(
    key: string | ArrayBuffer,
    message: string,
  ): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const keyData = typeof key === 'string' ? encoder.encode(key) : key;
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    return await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  }

  /**
   * ArrayBuffer를 Hex 문자열로 변환
   */
  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }

  /**
   * 기본 파이프라인 생성
   *
   * 프로젝트 생성 시 자동으로 기본 파이프라인을 생성합니다.
   * Node.js 프로젝트를 위한 기본 빌드 파이프라인을 제공합니다.
   *
   * @param projectId - 프로젝트 ID
   * @param repoName - GitHub 저장소 이름
   * @param branch - 선택된 브랜치
   */
  private async createDefaultPipeline(
    projectId: string,
    repoName: string,
    branch: string,
  ): Promise<void> {
    const defaultPipeline = {
      version: '0.2',
      runtime: 'node:18',
      blocks: [
        {
          id: 'trigger',
          block_type: 'branch_push_trigger',
          group_type: 'trigger',
          on_success: 'install-deps',
          branches: [branch],
        },
        {
          id: 'install-deps',
          block_type: 'node_package_manager',
          group_type: 'build',
          on_success: 'build-app',
          package_manager: 'npm',
          package_list: [],
        },
        {
          id: 'build-app',
          block_type: 'custom_build_command',
          group_type: 'build',
          on_success: 'test-app',
          custom_command: ['npm run build'],
        },
        {
          id: 'test-app',
          block_type: 'node_test_command',
          group_type: 'test',
          package_manager: 'npm',
          test_command: ['npm test'],
        },
      ],
      artifacts: ['dist/**/*', 'build/**/*'],
      environment_variables: {
        NODE_ENV: 'production',
        REPO_NAME: repoName,
        BRANCH: branch,
      },
      cache: {
        paths: ['node_modules/**/*'],
      },
    };

    // pipelines 테이블에 insert (프로젝트당 하나의 파이프라인)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipelines')
      .insert({
        project_id: projectId,
        data: defaultPipeline,
        env: null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create default pipeline: ${error.message}`, {
        projectId,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      throw new Error(`Failed to create default pipeline: ${error.message}`);
    }

    if (data) {
      this.logger.log(`Default pipeline created successfully:`, {
        pipelineId: data.pipeline_id,
        projectId: data.project_id,
      });
    }

    this.logger.log(
      `Default pipeline created for project ${projectId} with repo ${repoName} on branch ${branch}`,
    );
  }

  /**
   * 타입 가드: 단일 프로젝트 검증
   */
  private validateProject(item: unknown): item is Project {
    if (typeof item !== 'object' || item === null) {
      return false;
    }

    const project = item as Project;
    return (
      typeof project.project_id === 'string' &&
      typeof project.name === 'string' &&
      typeof project.user_id === 'string'
    );
  }
}
