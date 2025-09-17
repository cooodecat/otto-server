export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      build_execution_phases: {
        Row: {
          build_history_id: string
          created_at: string | null
          id: string
          phase_context_message: string | null
          phase_duration_seconds: number | null
          phase_end_time: string | null
          phase_start_time: string | null
          phase_status: string
          phase_type: string
        }
        Insert: {
          build_history_id: string
          created_at?: string | null
          id?: string
          phase_context_message?: string | null
          phase_duration_seconds?: number | null
          phase_end_time?: string | null
          phase_start_time?: string | null
          phase_status: string
          phase_type: string
        }
        Update: {
          build_history_id?: string
          created_at?: string | null
          id?: string
          phase_context_message?: string | null
          phase_duration_seconds?: number | null
          phase_end_time?: string | null
          phase_start_time?: string | null
          phase_status?: string
          phase_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_execution_phases_build_history_id_fkey"
            columns: ["build_history_id"]
            isOneToOne: false
            referencedRelation: "build_histories"
            referencedColumns: ["id"]
          },
        ]
      }
      build_histories: {
        Row: {
          aws_build_id: string
          build_error_message: string | null
          build_execution_status: string
          build_spec: Json
          created_at: string | null
          duration_seconds: number | null
          end_time: string | null
          environment_variables: Json | null
          id: string
          logs_url: string | null
          project_id: string
          start_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aws_build_id: string
          build_error_message?: string | null
          build_execution_status?: string
          build_spec: Json
          created_at?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          environment_variables?: Json | null
          id?: string
          logs_url?: string | null
          project_id: string
          start_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aws_build_id?: string
          build_error_message?: string | null
          build_execution_status?: string
          build_spec?: Json
          created_at?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          environment_variables?: Json | null
          id?: string
          logs_url?: string | null
          project_id?: string
          start_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      github_installations: {
        Row: {
          account_id: string
          account_login: string
          account_type: string
          created_at: string | null
          github_installation_id: string
          installation_id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_login: string
          account_type: string
          created_at?: string | null
          github_installation_id: string
          installation_id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_login?: string
          account_type?: string
          created_at?: string | null
          github_installation_id?: string
          installation_id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_execution_logs: {
        Row: {
          created_at: string
          event_id: string
          execution_id: string
          id: string
          level: Database["public"]["Enums"]["log_level"]
          log_stream: string | null
          message: string
          phase: string | null
          raw_data: Json | null
          state: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string
          event_id: string
          execution_id: string
          id?: string
          level: Database["public"]["Enums"]["log_level"]
          log_stream?: string | null
          message: string
          phase?: string | null
          raw_data?: Json | null
          state?: string | null
          timestamp: string
        }
        Update: {
          created_at?: string
          event_id?: string
          execution_id?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          log_stream?: string | null
          message?: string
          phase?: string | null
          raw_data?: Json | null
          state?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      job_executions: {
        Row: {
          created_at: string
          ended_at: string | null
          execution_id: string
          external_id: string
          id: string
          project_name: string
          provider: string
          started_at: string
          status: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          execution_id?: string
          external_id?: string
          id?: string
          project_name?: string
          provider?: string
          started_at: string
          status?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          execution_id?: string
          external_id?: string
          id?: string
          project_name?: string
          provider?: string
          started_at?: string
          status?: string | null
        }
        Relationships: []
      }
      log_collection_state: {
        Row: {
          collection_status: Database["public"]["Enums"]["collection_status"]
          error_message: string
          execution_id: string
          last_collected_at: string | null
          last_token: string
          updated_at: string | null
        }
        Insert: {
          collection_status: Database["public"]["Enums"]["collection_status"]
          error_message: string
          execution_id: string
          last_collected_at?: string | null
          last_token: string
          updated_at?: string | null
        }
        Update: {
          collection_status?: Database["public"]["Enums"]["collection_status"]
          error_message?: string
          execution_id?: string
          last_collected_at?: string | null
          last_token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pipeline: {
        Row: {
          created_at: string
          data: Json | null
          env: Json | null
          pipeline_id: string
          project_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          env?: Json | null
          pipeline_id?: string
          project_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          env?: Json | null
          pipeline_id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          github_id: string | null
          github_username: string | null
          id: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          github_id?: string | null
          github_username?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          github_id?: string | null
          github_username?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          artifact_bucket: string | null
          artifact_retention_days: number | null
          build_image: string
          build_timeout: number
          cloudwatch_log_group: string | null
          codebuild_error_message: string | null
          codebuild_project_name: string | null
          codebuild_status: string | null
          compute_type: string
          created_at: string | null
          description: string | null
          github_owner: string
          github_repo_id: string
          github_repo_name: string
          github_repo_url: string
          installation_id: string | null
          name: string
          project_id: string
          selected_branch: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artifact_bucket?: string | null
          artifact_retention_days?: number | null
          build_image?: string
          build_timeout?: number
          cloudwatch_log_group?: string | null
          codebuild_error_message?: string | null
          codebuild_project_name?: string | null
          codebuild_status?: string | null
          compute_type?: string
          created_at?: string | null
          description?: string | null
          github_owner: string
          github_repo_id: string
          github_repo_name: string
          github_repo_url: string
          installation_id?: string | null
          name: string
          project_id?: string
          selected_branch?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artifact_bucket?: string | null
          artifact_retention_days?: number | null
          build_image?: string
          build_timeout?: number
          cloudwatch_log_group?: string | null
          codebuild_error_message?: string | null
          codebuild_project_name?: string | null
          codebuild_status?: string | null
          compute_type?: string
          created_at?: string | null
          description?: string | null
          github_owner?: string
          github_repo_id?: string
          github_repo_name?: string
          github_repo_url?: string
          installation_id?: string | null
          name?: string
          project_id?: string
          selected_branch?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "github_installations"
            referencedColumns: ["installation_id"]
          },
        ]
      }
      push_events: {
        Row: {
          branch_name: string | null
          commit_author_name: string | null
          commit_message: string | null
          commit_sha: string
          created_at: string | null
          event_id: string
          project_id: string
          pushed_at: string
        }
        Insert: {
          branch_name?: string | null
          commit_author_name?: string | null
          commit_message?: string | null
          commit_sha: string
          created_at?: string | null
          event_id?: string
          project_id: string
          pushed_at: string
        }
        Update: {
          branch_name?: string | null
          commit_author_name?: string | null
          commit_message?: string | null
          commit_sha?: string
          created_at?: string | null
          event_id?: string
          project_id?: string
          pushed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      collection_status: "ACTIVE" | "STOPPED" | "ERROR"
      log_level: "DEBUG" | "INFO" | "WARN" | "ERROR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      collection_status: ["ACTIVE", "STOPPED", "ERROR"],
      log_level: ["DEBUG", "INFO", "WARN", "ERROR"],
    },
  },
} as const
