import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../supabase/guards/supabase-auth.guard';
import { ProjectService } from '../services/project.service';
import type { AuthenticatedUser } from '../../types/auth.types';
import type {
  ProjectsResponse,
  ProjectDetailResponse,
  CreateProjectWithGithubRequest,
  CreateProjectWithGithubResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  DeleteProjectResponse,
  RetryCodeBuildResponse,
} from '../dto/project.dto';

@Controller('projects')
@UseGuards(SupabaseAuthGuard)
export class ProjectController {
  private readonly logger = new Logger(ProjectController.name);

  constructor(private readonly projectService: ProjectService) {}

  /**
   * @tag project
   * @summary 사용자 프로젝트 목록 조회
   */
  @Get()
  async getUserProjects(
    @Req() req: { user: AuthenticatedUser },
  ): Promise<ProjectsResponse> {
    try {
      this.logger.log(`[ProjectController] getUserProjects called for user: ${req.user?.id}`);
      const result = await this.projectService.getUserProjects(req.user.id);
      this.logger.log(`[ProjectController] Returning ${result.totalProjects} projects`);
      return result;
    } catch (error) {
      this.logger.error('Error in getUserProjects:', error);
      throw new HttpException(
        'Failed to fetch projects',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag project
   * @summary 프로젝트 상세 정보 조회
   */
  @Get(':id')
  async getProjectDetail(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') projectId: string,
  ): Promise<ProjectDetailResponse> {
    try {
      return await this.projectService.getProjectDetail(req.user.id, projectId);
    } catch (error) {
      this.logger.error('Error in getProjectDetail:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch project detail',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag project
   * @summary GitHub 연동 프로젝트 생성
   */
  @Post('with-github')
  async createProjectWithGithub(
    @Req() req: { user: AuthenticatedUser },
    @Body() body: CreateProjectWithGithubRequest,
  ): Promise<CreateProjectWithGithubResponse> {
    try {
      this.logger.log(
        `[Project Controller] 프로젝트 생성 요청 받음: userId=${req.user.id}, projectName=${body.name}`,
      );
      this.logger.log(
        `[Project Controller] 요청 데이터:`,
        JSON.stringify(body, null, 2),
      );

      return await this.projectService.createProjectWithGithub(
        req.user.id,
        body,
      );
    } catch (error) {
      this.logger.error('Error in createProjectWithGithub:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create project',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag project
   * @summary 프로젝트 업데이트
   */
  @Patch(':id')
  async updateProject(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') projectId: string,
    @Body() updates: UpdateProjectRequest,
  ): Promise<UpdateProjectResponse> {
    try {
      return await this.projectService.updateProject(
        req.user.id,
        projectId,
        updates,
      );
    } catch (error) {
      this.logger.error('Error in updateProject:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update project',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag project
   * @summary 프로젝트 삭제
   */
  @Delete(':id')
  async deleteProject(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') projectId: string,
  ): Promise<DeleteProjectResponse> {
    try {
      return await this.projectService.deleteProject(req.user.id, projectId);
    } catch (error) {
      this.logger.error('Error in deleteProject:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete project',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @tag project
   * @summary CodeBuild 재시도
   */
  @Post(':id/retry-codebuild')
  async retryCodeBuild(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') projectId: string,
  ): Promise<RetryCodeBuildResponse> {
    try {
      return await this.projectService.retryCodeBuild(req.user.id, projectId);
    } catch (error) {
      this.logger.error('Error in retryCodeBuild:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retry CodeBuild',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
