import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { PipelineExecutorService } from './pipeline-executor.service';
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
  private readonly logger = new Logger(PipelineController.name);

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly pipelineExecutorService: PipelineExecutorService,
  ) {}

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
  ): Promise<any> {
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

  @Patch(':id')
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

  /**
   * 파이프라인 실행
   */
  @Post(':id/execute')
  async executePipeline(
    @Request() req,
    @Param('id') pipelineId: string,
    @Body() dto: { projectId: string },
  ) {
    const userId = req.user.sub;

    this.logger.log('Executing pipeline', {
      pipelineId,
      projectId: dto.projectId,
      userId,
    });

    return this.pipelineExecutorService.executePipeline(
      pipelineId,
      userId,
      dto.projectId,
    );
  }
}
