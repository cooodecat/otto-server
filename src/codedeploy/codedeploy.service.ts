import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeDeployClient,
  CreateApplicationCommand,
  CreateDeploymentCommand,
  CreateDeploymentGroupCommand,
  GetApplicationCommand,
  GetDeploymentCommand,
  GetDeploymentGroupCommand,
  UpdateDeploymentGroupCommand,
  ListDeploymentInstancesCommand,
  ApplicationDoesNotExistException,
  DeploymentGroupDoesNotExistException,
} from '@aws-sdk/client-codedeploy';
import { SupabaseService } from '../supabase/supabase.service';
import {
  DeploymentConfig,
  DeploymentResult,
  DeploymentStatus,
  S3ArtifactLocation,
  DeploymentRequest,
} from './types/codedeploy.types';

@Injectable()
export class CodeDeployService {
  private readonly logger = new Logger(CodeDeployService.name);
  private readonly client: CodeDeployClient;
  private readonly serviceRole: string;
  private readonly artifactsBucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || 'ap-northeast-2';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.client = new CodeDeployClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.serviceRole = this.configService.get<string>('AWS_CODEDEPLOY_SERVICE_ROLE');
    this.artifactsBucket = this.configService.get<string>('CODEBUILD_ARTIFACTS_BUCKET');

    this.logger.log('CodeDeploy service initialized', {
      region,
      serviceRole: this.serviceRole ? 'configured' : 'missing',
      artifactsBucket: this.artifactsBucket,
    });
  }

  /**
   * 파이프라인 노드 설정으로부터 배포 실행
   */
  async deployFromPipelineNode(request: DeploymentRequest): Promise<DeploymentResult> {
    const { buildId, projectId, userId, nodeConfig } = request;

    this.logger.log('Starting deployment from pipeline node', {
      buildId,
      projectId,
      userId,
      environment: nodeConfig.environment,
    });

    try {
      // 1. 빌드 정보 조회
      const build = await this.getBuildInfo(buildId);
      if (!build) {
        throw new Error(`Build not found: ${buildId}`);
      }

      // 2. 애플리케이션 확인/생성
      const appName = await this.ensureApplication(userId, projectId, nodeConfig);

      // 3. 배포 그룹 확인/생성/업데이트
      const deploymentGroupName = await this.ensureDeploymentGroup(
        appName,
        nodeConfig,
        userId,
      );

      // 4. S3 아티팩트 위치 결정
      const s3Location = this.getArtifactLocation(buildId, userId, projectId);

      // 5. 배포 생성
      const deploymentId = await this.createDeployment(
        appName,
        deploymentGroupName,
        s3Location,
        nodeConfig,
      );

      // 6. DB에 배포 정보 저장
      await this.saveDeploymentInfo(deploymentId, buildId, projectId, userId, nodeConfig);

      return {
        deploymentId,
        applicationName: appName,
        deploymentGroupName,
        status: 'InProgress',
        createTime: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to deploy from pipeline node', error);
      throw error;
    }
  }

  /**
   * 빌드 정보 조회
   */
  private async getBuildInfo(buildId: string) {
    const { data: build, error } = await this.supabaseService.client
      .from('builds')
      .select('*')
      .eq('build_id', buildId)
      .single();

    if (error) {
      this.logger.error('Failed to get build info', error);
      return null;
    }

    return build;
  }

  /**
   * 애플리케이션 확인 및 생성
   */
  private async ensureApplication(
    userId: string,
    projectId: string,
    nodeConfig: DeploymentConfig,
  ): Promise<string> {
    const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9-]/g, '-');
    const appName = `otto-${nodeConfig.environment}-${sanitizedProjectId}`.substring(0, 100);

    try {
      // 애플리케이션 존재 확인
      await this.client.send(new GetApplicationCommand({
        applicationName: appName,
      }));

      this.logger.log(`Application ${appName} already exists`);
    } catch (error) {
      if (error instanceof ApplicationDoesNotExistException || error.name === 'ApplicationDoesNotExistException') {
        // 애플리케이션 생성
        this.logger.log(`Creating new application: ${appName}`);

        await this.client.send(new CreateApplicationCommand({
          applicationName: appName,
          computePlatform: 'Server', // EC2/On-premises
          tags: [
            { Key: 'UserId', Value: userId },
            { Key: 'ProjectId', Value: projectId },
            { Key: 'Environment', Value: nodeConfig.environment },
            { Key: 'ManagedBy', Value: 'Otto' },
          ],
        }));
      } else {
        throw error;
      }
    }

    return appName;
  }

  /**
   * 배포 그룹 확인/생성/업데이트
   */
  private async ensureDeploymentGroup(
    appName: string,
    nodeConfig: DeploymentConfig,
    userId: string,
  ): Promise<string> {
    const deploymentGroupName = `${nodeConfig.environment}-group`;

    // EC2 태그 필터 구성
    const ec2TagFilters = nodeConfig.instanceTags?.map(tag => ({
      Type: 'KEY_AND_VALUE',
      Key: tag.key,
      Value: tag.value,
    })) || [
      {
        Type: 'KEY_AND_VALUE',
        Key: 'Environment',
        Value: nodeConfig.environment,
      },
    ];

    // 배포 설정 맵핑
    const deploymentConfigName = this.mapDeploymentStrategy(nodeConfig.deploymentStrategy?.type);

    // 자동 롤백 설정
    const autoRollbackConfiguration = {
      enabled: nodeConfig.rollbackConfig?.enabled || true,
      events: [],
    };

    if (nodeConfig.rollbackConfig?.onDeploymentFailure) {
      autoRollbackConfiguration.events.push('DEPLOYMENT_FAILURE');
    }
    if (nodeConfig.rollbackConfig?.onAlarmThreshold) {
      autoRollbackConfiguration.events.push('DEPLOYMENT_STOP_ON_ALARM');
    }

    const deploymentGroupParams = {
      applicationName: appName,
      deploymentGroupName,
      serviceRoleArn: this.serviceRole,
      ec2TagFilters,
      deploymentConfigName,
      autoRollbackConfiguration,
    };

    try {
      // 배포 그룹 존재 확인
      await this.client.send(new GetDeploymentGroupCommand({
        applicationName: appName,
        deploymentGroupName,
      }));

      // 존재하면 업데이트
      this.logger.log(`Updating deployment group: ${deploymentGroupName}`);

      await this.client.send(new UpdateDeploymentGroupCommand({
        ...deploymentGroupParams,
        currentDeploymentGroupName: deploymentGroupName,
      }));
    } catch (error) {
      if (error instanceof DeploymentGroupDoesNotExistException || error.name === 'DeploymentGroupDoesNotExistException') {
        // 존재하지 않으면 생성
        this.logger.log(`Creating deployment group: ${deploymentGroupName}`);

        await this.client.send(new CreateDeploymentGroupCommand(deploymentGroupParams));
      } else {
        throw error;
      }
    }

    return deploymentGroupName;
  }

  /**
   * S3 아티팩트 위치 결정
   */
  private getArtifactLocation(
    buildId: string,
    userId: string,
    projectId: string,
  ): S3ArtifactLocation {
    // CodeBuild가 저장한 S3 경로 구성
    const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9-]/g, '-');

    return {
      bucket: this.artifactsBucket,
      key: `otto-${sanitizedProjectId}-${userId}-artifacts/${buildId}`,
      bundleType: 'zip',
    };
  }

  /**
   * 배포 생성
   */
  private async createDeployment(
    appName: string,
    deploymentGroupName: string,
    s3Location: S3ArtifactLocation,
    nodeConfig: DeploymentConfig,
  ): Promise<string> {
    const result = await this.client.send(new CreateDeploymentCommand({
      applicationName: appName,
      deploymentGroupName,
      revision: {
        revisionType: 'S3',
        s3Location,
      },
      description: `Deployment: ${nodeConfig.deploymentName} [${nodeConfig.environment}]`,
      fileExistsBehavior: 'OVERWRITE',
      ignoreApplicationStopFailures: false,
    }));

    this.logger.log(`Deployment created: ${result.deploymentId}`);
    return result.deploymentId;
  }

  /**
   * 배포 전략 맵핑
   */
  private mapDeploymentStrategy(strategy?: string): string {
    const strategyMap = {
      'all-at-once': 'CodeDeployDefault.AllAtOnce',
      'half-at-a-time': 'CodeDeployDefault.HalfAtATime',
      'one-at-a-time': 'CodeDeployDefault.OneAtATime',
      'blue-green': 'CodeDeployDefault.AllAtOnceBlueGreen',
    };

    return strategyMap[strategy] || 'CodeDeployDefault.AllAtOnce';
  }

  /**
   * 배포 정보 DB 저장
   */
  private async saveDeploymentInfo(
    deploymentId: string,
    buildId: string,
    projectId: string,
    userId: string,
    nodeConfig: DeploymentConfig,
  ) {
    const { error } = await this.supabaseService.client.from('deployments').insert({
      deployment_id: deploymentId,
      build_id: buildId,
      project_id: projectId,
      user_id: userId,
      environment: nodeConfig.environment,
      deployment_name: nodeConfig.deploymentName,
      status: 'InProgress',
      config: nodeConfig,
      created_at: new Date().toISOString(),
    });

    if (error) {
      this.logger.error('Failed to save deployment info', error);
      // 저장 실패해도 배포는 계속 진행
    }
  }

  /**
   * 배포 상태 조회
   */
  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus> {
    const result = await this.client.send(new GetDeploymentCommand({
      deploymentId,
    }));

    const status: DeploymentStatus = {
      deploymentId,
      status: result.deploymentInfo?.status as any || 'Unknown',
      errorInformation: result.deploymentInfo?.errorInformation,
      createTime: result.deploymentInfo?.createTime,
      completeTime: result.deploymentInfo?.completeTime,
      deploymentOverview: result.deploymentInfo?.deploymentOverview,
      progress: this.calculateProgress(result.deploymentInfo?.status),
    };

    // DB 업데이트
    await this.updateDeploymentStatus(deploymentId, status);

    return status;
  }

  /**
   * 진행률 계산
   */
  private calculateProgress(status?: string): number {
    const progressMap = {
      'Created': 10,
      'Queued': 20,
      'InProgress': 50,
      'Baking': 70,
      'Ready': 90,
      'Succeeded': 100,
      'Failed': 0,
      'Stopped': 0,
    };

    return progressMap[status] || 0;
  }

  /**
   * DB에 배포 상태 업데이트
   */
  private async updateDeploymentStatus(deploymentId: string, status: DeploymentStatus) {
    const { error } = await this.supabaseService.client
      .from('deployments')
      .update({
        status: status.status,
        updated_at: new Date().toISOString(),
        completed_at: status.completeTime ? new Date(status.completeTime).toISOString() : null,
      })
      .eq('deployment_id', deploymentId);

    if (error) {
      this.logger.error('Failed to update deployment status', error);
    }
  }

  /**
   * 배포 인스턴스 목록 조회
   */
  async listDeploymentInstances(deploymentId: string): Promise<string[]> {
    const result = await this.client.send(new ListDeploymentInstancesCommand({
      deploymentId,
    }));

    return result.instancesList || [];
  }
}