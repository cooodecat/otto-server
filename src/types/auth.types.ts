export interface GitHubUser {
  id: string;
  email: string;
  provider: 'github';
  github_username?: string;
  avatar_url?: string;
  full_name?: string;
  created_at: string;
  last_sign_in_at: string;
}

export interface SupabaseJwtPayload {
  sub: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
  confirmed_at?: string;
  last_sign_in_at?: string;
  app_metadata: {
    provider?: string;
    providers?: string[];
  };
  user_metadata: {
    avatar_url?: string;
    email?: string;
    email_verified?: boolean;
    full_name?: string;
    iss?: string;
    name?: string;
    phone_verified?: boolean;
    preferred_username?: string;
    provider_id?: string;
    sub?: string;
    user_name?: string;
  };
  session_id?: string;
  aal?: string;
  amr?: Array<{ method: string; timestamp: number }>;
  iat: number;
  exp: number;
  iss: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  provider?: string;
  githubUsername?: string;
  avatarUrl?: string;
  fullName?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}