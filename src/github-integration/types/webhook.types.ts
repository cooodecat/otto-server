// GitHub Webhook Event Types
export interface GithubWebhookPayload {
  action?: string;
  installation?: GithubInstallation;
  sender?: GithubUser;
  repository?: GithubRepository;
  repositories_added?: GithubRepository[];
  repositories_removed?: GithubRepository[];
  ref?: string;
  pusher?: {
    name: string;
    email?: string;
  };
  commits?: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  }>;
  pull_request?: GithubPullRequest;
}

export interface GithubInstallation {
  id: number;
  account: {
    login: string;
    type: string;
  };
  repository_selection?: string;
  permissions?: Record<string, string>;
  events?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface GithubUser {
  login: string;
  id: number;
  avatar_url?: string;
  type?: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  full_name: string;
  owner?: GithubUser;
  private?: boolean;
  html_url?: string;
  description?: string;
}

export interface GithubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: string;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
}
