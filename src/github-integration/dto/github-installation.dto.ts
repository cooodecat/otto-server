export interface GitHubInstallation {
  installation_id: string;
  user_id: string;
  account_id: string;
  account_login: string;
  account_type: string;
  github_installation_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GitHubInstallationsResponse {
  installations: GitHubInstallation[];
  totalInstallations: number;
}

export interface GitHubInstallUrlResponse {
  installUrl: string;
  state: string;
}

export interface GitHubStatusResponse {
  hasInstallation: boolean;
  totalInstallations: number;
  totalConnectedProjects: number;
  installations: GitHubInstallation[];
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string | null;
}

export interface GitHubRepositoriesResponse {
  repositories: GitHubRepository[];
  totalRepositories: number;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: {
    sha: string;
    url: string;
  };
}

export interface GitHubBranchesResponse {
  branches: GitHubBranch[];
  totalBranches: number;
}
