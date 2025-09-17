import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreatePipelineDto,
  UpdatePipelineDto,
  GetPipelinesDto,
  PipelineResponse,
  PipelinesListResponse,
} from './dto';
import type { PipelineDB } from './types/pipeline-db.types';

@Injectable()
export class PipelineService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createPipeline(
    createPipelineDto: CreatePipelineDto,
  ): Promise<PipelineResponse> {
    // 기존 데이터 업데이트 (upsert)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipelines')
      .upsert({
        project_id: createPipelineDto.projectId,
        name: createPipelineDto.name,
        data: createPipelineDto.flowData,
        env: null,
      })
      .select()
      .single<PipelineDB>();

    if (error || !data) {
      throw new Error(`Failed to create/update pipeline: ${error?.message}`);
    }

    return this.mapToResponse(data);
  }

  async getPipelinesByProject(
    getPipelinesDto: GetPipelinesDto,
  ): Promise<PipelinesListResponse> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipelines')
      .select('*')
      .eq('project_id', getPipelinesDto.projectId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      throw new Error(`Failed to fetch pipelines: ${error?.message}`);
    }

    const pipelines = data as PipelineDB[];
    return {
      pipelines: pipelines.map((pipeline) => this.mapToResponse(pipeline)),
      total: pipelines.length,
    };
  }

  async getPipelineById(id: string): Promise<PipelineResponse> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipelines')
      .select('*')
      .eq('pipeline_id', id)
      .single<PipelineDB>();

    if (error || !data) {
      throw new NotFoundException(`Pipeline with ID ${id} not found`);
    }

    return this.mapToResponse(data);
  }

  async updatePipeline(
    id: string,
    updatePipelineDto: UpdatePipelineDto,
  ): Promise<PipelineResponse> {
    const updateData: Record<string, unknown> = {};

    if (updatePipelineDto.name !== undefined) {
      updateData.name = updatePipelineDto.name;
    }

    if (updatePipelineDto.flowData !== undefined) {
      updateData.data = updatePipelineDto.flowData;
    }

    if (updatePipelineDto.env !== undefined) {
      updateData.env = updatePipelineDto.env;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipelines')
      .update(updateData)
      .eq('pipeline_id', id)
      .select();

    if (error) {
      throw new NotFoundException(
        `Failed to update pipeline: ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      throw new NotFoundException(`Pipeline with ID ${id} not found`);
    }

    const pipelines = data as PipelineDB[];
    return this.mapToResponse(pipelines[0]);
  }

  async deletePipeline(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('pipelines')
      .delete()
      .eq('pipeline_id', id);

    if (error) {
      throw new NotFoundException(
        `Failed to delete pipeline: ${error.message}`,
      );
    }
  }

  private mapToResponse(pipeline: PipelineDB): PipelineResponse {
    return {
      id: pipeline.pipeline_id,
      projectId: pipeline.project_id,
      name:
        pipeline.name ||
        `Pipeline ${new Date(pipeline.created_at).toLocaleString()}`, // DB의 name 필드 사용
      description: 'Pipeline created from dashboard', // 기존 스키마에 description 필드가 없어서 기본값
      flowData: pipeline.data,
      isActive: true, // 기존 스키마에 isActive 필드가 없어서 기본값
      createdAt: new Date(pipeline.created_at),
      updatedAt: new Date(pipeline.created_at), // 기존 스키마에 updated_at이 없어서 created_at 사용
    };
  }
}
