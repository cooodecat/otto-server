import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import type {
  CreatePipelineDto,
  UpdatePipelineDto,
  GetPipelinesDto,
  PipelineResponse,
  PipelinesListResponse,
} from './dto';
import { SupabaseAuthGuard } from '@/supabase/guards/supabase-auth.guard';

@Controller('pipelines')
@UseGuards(SupabaseAuthGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post()
  async createPipeline(
    @Body() createPipelineDto: CreatePipelineDto,
  ): Promise<PipelineResponse> {
    return this.pipelineService.createPipeline(createPipelineDto);
  }

  @Get('project/:projectId')
  async getPipelinesByProject(
    @Param('projectId') projectId: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<PipelinesListResponse> {
    const getPipelinesDto: GetPipelinesDto = {
      projectId,
      activeOnly: activeOnly === 'true',
    };
    return this.pipelineService.getPipelinesByProject(getPipelinesDto);
  }

  @Get(':id')
  async getPipelineById(@Param('id') id: string): Promise<PipelineResponse> {
    return this.pipelineService.getPipelineById(id);
  }

  @Put(':id')
  async updatePipeline(
    @Param('id') id: string,
    @Body() updatePipelineDto: UpdatePipelineDto,
  ): Promise<PipelineResponse> {
    return this.pipelineService.updatePipeline(id, updatePipelineDto);
  }

  @Delete(':id')
  async deletePipeline(@Param('id') id: string): Promise<void> {
    return this.pipelineService.deletePipeline(id);
  }
}
