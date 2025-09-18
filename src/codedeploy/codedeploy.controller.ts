import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Sse,
  Logger,
} from '@nestjs/common';
import { Observable, interval } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';
import { CodeDeployService } from './codedeploy.service';
import { SupabaseAuthGuard } from '../supabase/guards/supabase-auth.guard';
import { DeploymentRequest, DeploymentConfig } from './types/codedeploy.types';

@Controller('codedeploy')
@UseGuards(SupabaseAuthGuard)
export class CodeDeployController {
  private readonly logger = new Logger(CodeDeployController.name);

  constructor(private readonly codeDeployService: CodeDeployService) {}

  /**
   * 파이프라인에서 배포 실행
   */
  @Post('deploy-from-pipeline')
  async deployFromPipeline(
    @Request() req,
    @Body() dto: {
      buildId: string;
      projectId: string;
      nodeConfig: DeploymentConfig;
    },
  ) {
    const userId = req.user.sub;

    this.logger.log('Received deployment request from pipeline', {
      userId,
      buildId: dto.buildId,
      projectId: dto.projectId,
      environment: dto.nodeConfig.environment,
    });

    const request: DeploymentRequest = {
      buildId: dto.buildId,
      projectId: dto.projectId,
      userId,
      nodeConfig: dto.nodeConfig,
    };

    return this.codeDeployService.deployFromPipelineNode(request);
  }

  /**
   * 배포 상태 조회
   */
  @Get('status/:deploymentId')
  async getDeploymentStatus(@Param('deploymentId') deploymentId: string) {
    this.logger.log('Getting deployment status', { deploymentId });
    return this.codeDeployService.getDeploymentStatus(deploymentId);
  }

  /**
   * 배포 인스턴스 목록 조회
   */
  @Get('instances/:deploymentId')
  async listDeploymentInstances(@Param('deploymentId') deploymentId: string) {
    this.logger.log('Listing deployment instances', { deploymentId });
    return this.codeDeployService.listDeploymentInstances(deploymentId);
  }

  /**
   * 배포 상태 실시간 스트리밍 (SSE)
   */
  @Sse('stream/:deploymentId')
  streamDeploymentStatus(
    @Param('deploymentId') deploymentId: string,
  ): Observable<MessageEvent> {
    this.logger.log('Starting deployment status stream', { deploymentId });

    return interval(3000).pipe(
      map(async () => {
        try {
          const status = await this.codeDeployService.getDeploymentStatus(deploymentId);

          return {
            data: JSON.stringify(status),
            type: 'deployment-status',
          } as MessageEvent;
        } catch (error) {
          this.logger.error('Error getting deployment status', error);
          return {
            data: JSON.stringify({ error: 'Failed to get status' }),
            type: 'error',
          } as MessageEvent;
        }
      }),
      takeWhile(async (eventPromise) => {
        const event = await eventPromise;
        const data = JSON.parse(event.data);

        // 완료 상태면 스트림 종료
        return !['Succeeded', 'Failed', 'Stopped'].includes(data.status);
      }, true),
    );
  }
}