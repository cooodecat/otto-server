import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreatePipelineDto,
  UpdatePipelineDto,
  GetPipelinesDto,
  PipelineResponse,
  PipelinesListResponse,
} from './dto';
import { PipelineEntity } from '../types/pipeline.types';

@Injectable()
export class PipelineService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createPipeline(
    createPipelineDto: CreatePipelineDto,
  ): Promise<PipelineResponse> {
    // 기존 데이터 업데이트 (upsert)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipeline')
      .upsert({
        project_id: createPipelineDto.projectId,
        data: createPipelineDto.flowData,
        env: null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create/update pipeline: ${error.message}`);
    }

    return this.mapToResponse(data);
  }

  async getPipelinesByProject(
    getPipelinesDto: GetPipelinesDto,
  ): Promise<PipelinesListResponse> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipeline')
      .select('*')
      .eq('project_id', getPipelinesDto.projectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pipelines: ${error.message}`);
    }

    return {
      pipelines: data.map((pipeline) => this.mapToResponse(pipeline)),
      total: data.length,
    };
  }

  async getPipelineById(id: string): Promise<PipelineResponse> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipeline')
      .select('*')
      .eq('pipeline_id', id)
      .single();

    if (error) {
      throw new NotFoundException(`Pipeline with ID ${id} not found`);
    }

    return this.mapToResponse(data);
  }

  async updatePipeline(
    id: string,
    updatePipelineDto: UpdatePipelineDto,
  ): Promise<PipelineResponse> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pipeline')
      .update({
        data: updatePipelineDto.flowData,
        env: updatePipelineDto.env || null,
      })
      .eq('pipeline_id', id)
      .select()
      .single();

    if (error) {
      throw new NotFoundException(
        `Failed to update pipeline: ${error.message}`,
      );
    }

    return this.mapToResponse(data);
  }

  async deletePipeline(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('pipeline')
      .delete()
      .eq('pipeline_id', id);

    if (error) {
      throw new NotFoundException(
        `Failed to delete pipeline: ${error.message}`,
      );
    }
  }

  private mapToResponse(pipeline: any): PipelineResponse {
    return {
      id: pipeline.pipeline_id,
      projectId: pipeline.project_id,
      name: `Pipeline ${new Date(pipeline.created_at).toLocaleString()}`, // 기존 스키마에 name 필드가 없어서 생성
      description: 'Pipeline created from dashboard', // 기존 스키마에 description 필드가 없어서 기본값
      flowData: pipeline.data,
      isActive: true, // 기존 스키마에 isActive 필드가 없어서 기본값
      createdAt: new Date(pipeline.created_at),
      updatedAt: new Date(pipeline.created_at), // 기존 스키마에 updated_at이 없어서 created_at 사용
    };
  }
}
