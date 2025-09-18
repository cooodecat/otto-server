import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CodeBuildService } from '../codebuild/codebuild.service';
import { CodeDeployService } from '../codedeploy/codedeploy.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DeploymentConfig } from '../codedeploy/types/codedeploy.types';

interface PipelineNode {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
}

interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

interface ExecutionContext {
  buildId?: string;
  artifactLocation?: string;
  deploymentId?: string;
  [key: string]: any;
}

@Injectable()
export class PipelineExecutorService {
  private readonly logger = new Logger(PipelineExecutorService.name);

  constructor(
    @Inject(forwardRef(() => CodeBuildService))
    private readonly codeBuildService: CodeBuildService,
    private readonly codeDeployService: CodeDeployService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * 파이프라인 실행
   */
  async executePipeline(
    pipelineId: string,
    userId: string,
    projectId: string,
  ): Promise<{ executionId: string; status: string }> {
    this.logger.log('Starting pipeline execution', {
      pipelineId,
      userId,
      projectId,
    });

    try {
      // 1. 파이프라인 구성 로드
      const pipeline = await this.loadPipeline(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline not found: ${pipelineId}`);
      }

      // 2. 실행 순서 결정 (토폴로지 정렬)
      const nodes = pipeline.data?.nodes || [];
      const edges = pipeline.data?.edges || [];
      const executionOrder = this.getExecutionOrder(nodes, edges);

      // 3. 실행 ID 생성
      const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 4. 실행 정보 저장
      await this.savePipelineExecution(executionId, pipelineId, userId, projectId);

      // 5. 노드 순차 실행
      let context: ExecutionContext = {};

      for (const node of executionOrder) {
        this.logger.log(`Executing node: ${node.type}`, { nodeId: node.id });

        try {
          context = await this.executeNode(node, context, userId, projectId);

          // 노드 실행 상태 업데이트
          await this.updateNodeStatus(executionId, node.id, 'success');
        } catch (error) {
          this.logger.error(`Node execution failed: ${node.type}`, error);

          // 노드 실행 상태 업데이트
          await this.updateNodeStatus(executionId, node.id, 'failed');

          // 실패 시 파이프라인 중단
          throw error;
        }
      }

      // 6. 파이프라인 실행 완료
      await this.completePipelineExecution(executionId, 'success');

      return { executionId, status: 'success' };
    } catch (error) {
      this.logger.error('Pipeline execution failed', error);
      throw error;
    }
  }

  /**
   * 파이프라인 로드
   */
  private async loadPipeline(pipelineId: string) {
    const { data, error } = await this.supabaseService.client
      .from('pipelines')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .single();

    if (error) {
      this.logger.error('Failed to load pipeline', error);
      return null;
    }

    return data;
  }

  /**
   * 노드 실행 순서 결정 (토폴로지 정렬)
   */
  private getExecutionOrder(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineNode[] {
    // 간단한 구현: 연결 순서대로 정렬
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const visited = new Set<string>();
    const result: PipelineNode[] = [];

    // 시작 노드 찾기 (들어오는 엣지가 없는 노드)
    const startNodes = nodes.filter(node =>
      !edges.some(edge => edge.target === node.id)
    );

    // DFS로 순서 결정
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (node) {
        result.push(node);

        // 다음 노드들 방문
        edges
          .filter(edge => edge.source === nodeId)
          .forEach(edge => visit(edge.target));
      }
    };

    // 시작 노드들부터 방문
    startNodes.forEach(node => visit(node.id));

    return result;
  }

  /**
   * 개별 노드 실행
   */
  private async executeNode(
    node: PipelineNode,
    context: ExecutionContext,
    userId: string,
    projectId: string,
  ): Promise<ExecutionContext> {
    switch (node.type) {
      // 빌드 노드들
      case 'buildWebpack':
      case 'buildVite':
      case 'buildCustom':
        return this.executeBuildNode(node, context, userId, projectId);

      // 배포 노드
      case 'deployNode':
        return this.executeDeployNode(node, context, userId, projectId);

      // 시작/종료 노드
      case 'startNode':
      case 'pipelineStart':
      case 'endNode':
        // 아무 작업도 하지 않고 컨텍스트 반환
        return context;

      // 테스트 노드들
      case 'testJest':
      case 'testMocha':
      case 'testVitest':
        // TODO: 테스트 실행 로직 구현
        this.logger.warn(`Test node not yet implemented: ${node.type}`);
        return context;

      default:
        this.logger.warn(`Unknown node type: ${node.type}`);
        return context;
    }
  }

  /**
   * 빌드 노드 실행
   */
  private async executeBuildNode(
    node: PipelineNode,
    context: ExecutionContext,
    userId: string,
    projectId: string,
  ): Promise<ExecutionContext> {
    this.logger.log('Executing build node', { nodeType: node.type });

    // CodeBuild 프로젝트명
    const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9-]/g, '-');
    const codebuildProjectName = `otto-${sanitizedProjectId}-${userId}`;

    // buildspec 생성 (노드 타입에 따라)
    const buildSpec = this.createBuildSpec(node);

    // 빌드 시작
    const buildResult = await this.codeBuildService.startBuild(
      userId,
      projectId,
      codebuildProjectName,
      buildSpec,
      node.data.environmentVariables,
    );

    // 빌드 ID와 아티팩트 위치를 컨텍스트에 저장
    return {
      ...context,
      buildId: buildResult.buildId,
      artifactLocation: `otto-${sanitizedProjectId}-${userId}-artifacts/${buildResult.buildId}`,
    };
  }

  /**
   * 배포 노드 실행
   */
  private async executeDeployNode(
    node: PipelineNode,
    context: ExecutionContext,
    userId: string,
    projectId: string,
  ): Promise<ExecutionContext> {
    this.logger.log('Executing deploy node', { nodeType: node.type });

    // 빌드 ID 확인
    if (!context.buildId) {
      throw new Error('No build ID found in context for deployment');
    }

    // 배포 설정 구성
    const deploymentConfig: DeploymentConfig = {
      deploymentName: node.data.deploymentName || 'Pipeline Deployment',
      environment: node.data.environment || 'development',
      targetType: node.data.targetType || 'ec2',
      instanceTags: node.data.instanceTags || [
        { key: 'Environment', value: node.data.environment || 'development' }
      ],
      deploymentStrategy: node.data.deploymentStrategy || {
        type: 'all-at-once',
      },
      rollbackConfig: node.data.rollbackConfig || {
        enabled: true,
        onDeploymentFailure: true,
      },
    };

    // 배포 실행
    const deploymentResult = await this.codeDeployService.deployFromPipelineNode({
      buildId: context.buildId,
      projectId,
      userId,
      nodeConfig: deploymentConfig,
    });

    // 배포 ID를 컨텍스트에 저장
    return {
      ...context,
      deploymentId: deploymentResult.deploymentId,
    };
  }

  /**
   * buildspec 생성
   */
  private createBuildSpec(node: PipelineNode): string {
    const baseSpec = {
      version: '0.2',
      phases: {
        install: {
          'runtime-versions': {
            nodejs: node.data.nodeVersion || '18',
          },
          commands: [
            'echo "Installing dependencies..."',
            node.data.packageManager === 'yarn' ? 'yarn install' : 'npm install',
          ],
        },
        build: {
          commands: [],
        },
      },
      artifacts: {
        files: ['**/*'],
      },
    };

    // 노드 타입에 따라 빌드 명령어 설정
    switch (node.type) {
      case 'buildWebpack':
        baseSpec.phases.build.commands = [
          'echo "Building with Webpack..."',
          'npx webpack --mode production',
        ];
        break;

      case 'buildVite':
        baseSpec.phases.build.commands = [
          'echo "Building with Vite..."',
          'npx vite build',
        ];
        break;

      case 'buildCustom':
        baseSpec.phases.build.commands = node.data.commands || [
          'echo "Running custom build..."',
          'npm run build',
        ];
        break;

      default:
        baseSpec.phases.build.commands = [
          'echo "Running default build..."',
          'npm run build',
        ];
    }

    // YAML로 변환
    const yaml = require('js-yaml');
    return yaml.dump(baseSpec);
  }

  /**
   * 파이프라인 실행 정보 저장
   */
  private async savePipelineExecution(
    executionId: string,
    pipelineId: string,
    userId: string,
    projectId: string,
  ) {
    // TODO: 실행 정보를 DB에 저장
    this.logger.log('Saving pipeline execution', { executionId });
  }

  /**
   * 노드 실행 상태 업데이트
   */
  private async updateNodeStatus(
    executionId: string,
    nodeId: string,
    status: 'running' | 'success' | 'failed',
  ) {
    // TODO: 노드 상태를 DB에 업데이트
    this.logger.log('Updating node status', { executionId, nodeId, status });
  }

  /**
   * 파이프라인 실행 완료
   */
  private async completePipelineExecution(executionId: string, status: string) {
    // TODO: 실행 완료 정보를 DB에 업데이트
    this.logger.log('Completing pipeline execution', { executionId, status });
  }
}