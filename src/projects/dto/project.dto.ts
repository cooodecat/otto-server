export interface Project {
  project_id: string;
  name: string;
  description: string | null;
  github_owner: string | null;
  github_repo_id: string | null;
  github_repo_name: string | null;
  github_repo_url: string | null;
  selected_branch: string | null;
  installation_id: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  codebuild_status: string | null;
  codebuild_project_name: string | null;
  codebuild_project_arn: string | null;
  cloudwatch_log_group: string | null;
  codebuild_error_message: string | null;
}

export interface ProjectsResponse {
  projects: Project[];
  totalProjects: number;
}

export interface ProjectDetailResponse {
  project: Project;
}

export interface CreateProjectWithGithubRequest {
  name: string;
  description: string;
  installationId: string;
  githubRepoId: string;
  githubRepoUrl: string;
  githubRepoName: string;
  githubOwner: string;
  selectedBranch: string;
}

export interface CreateProjectWithGithubResponse {
  project: Project;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  selectedBranch?: string;
}

export interface UpdateProjectResponse {
  project: Project;
}

export interface DeleteProjectResponse {
  message: string;
}

export interface RetryCodeBuildResponse {
  message: string;
}
