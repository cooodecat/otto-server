/**
 * @fileoverview Supabase 데이터베이스 타입 정의
 *
 * 이 파일은 Supabase 데이터베이스의 스키마를 TypeScript 타입으로 정의합니다.
 * 자동 생성 명령어: pnpm supabase:types
 * 환경변수 SUPABASE_PROJECT_ID 설정 필요
 *
 * @author Otto Team
 * @version 1.0.0
 */

/**
 * JSON 데이터 타입
 *
 * Supabase에서 사용하는 JSON 필드의 타입을 정의합니다.
 * 재귀적으로 정의되어 중첩된 JSON 구조를 지원합니다.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Supabase 데이터베이스 스키마 타입
 *
 * 전체 데이터베이스의 구조를 정의하는 루트 타입입니다.
 * public 스키마의 모든 테이블, 뷰, 함수, 열거형을 포함합니다.
 */
export type Database = {
  /** 공개 스키마 */
  public: {
    /** 데이터베이스 테이블들 */
    Tables: {
      /** 사용자 프로필 테이블 */
      profiles: {
        /** 프로필 테이블의 행 타입 */
        Row: {
          /** 사용자 고유 식별자 (auth.users.id 참조) */
          id: string;
          /** 사용자명 (고유) */
          username: string | null;
          /** 표시명 */
          display_name: string | null;
          /** 자기소개 */
          bio: string | null;
          /** 프로필 이미지 URL */
          avatar_url: string | null;
          /** GitHub 사용자명 */
          github_username: string | null;
          /** GitHub 사용자 ID */
          github_id: string | null;
          /** 생성 시간 */
          created_at: string;
          /** 마지막 수정 시간 */
          updated_at: string;
        };
        /** 프로필 테이블 삽입 시 사용하는 타입 */
        Insert: {
          /** 사용자 고유 식별자 (필수) */
          id: string;
          /** 사용자명 (선택) */
          username?: string | null;
          /** 표시명 (선택) */
          display_name?: string | null;
          /** 자기소개 (선택) */
          bio?: string | null;
          /** 프로필 이미지 URL (선택) */
          avatar_url?: string | null;
          /** GitHub 사용자명 (선택) */
          github_username?: string | null;
          /** GitHub 사용자 ID (선택) */
          github_id?: string | null;
          /** 생성 시간 (자동 설정) */
          created_at?: string;
          /** 마지막 수정 시간 (자동 설정) */
          updated_at?: string;
        };
        /** 프로필 테이블 업데이트 시 사용하는 타입 */
        Update: {
          /** 사용자 고유 식별자 (일반적으로 업데이트하지 않음) */
          id?: string;
          /** 사용자명 (선택) */
          username?: string | null;
          /** 표시명 (선택) */
          display_name?: string | null;
          /** 자기소개 (선택) */
          bio?: string | null;
          /** 프로필 이미지 URL (선택) */
          avatar_url?: string | null;
          /** GitHub 사용자명 (선택) */
          github_username?: string | null;
          /** GitHub 사용자 ID (선택) */
          github_id?: string | null;
          /** 생성 시간 (일반적으로 업데이트하지 않음) */
          created_at?: string;
          /** 마지막 수정 시간 (자동 설정) */
          updated_at?: string;
        };
      };
      /** 프로젝트 테이블 */
      projects: {
        /** 프로젝트 테이블의 행 타입 */
        Row: {
          /** 프로젝트 고유 식별자 */
          id: string;
          /** 프로젝트 소유자 사용자 ID */
          userId: string;
          /** 프로젝트 이름 */
          name: string;
          /** Git 저장소 URL */
          repositoryUrl: string;
          /** 저장소 이름 */
          repositoryName: string;
          /** 기본 브랜치 */
          branch: string;
          /** AWS CodeBuild 프로젝트명 */
          codebuildProjectName: string;
          /** AWS 리전 */
          awsRegion: string | null;
          /** 프로젝트 상태 */
          status: 'active' | 'inactive' | 'pending';
          /** 생성 시간 */
          createdAt: string;
          /** 마지막 수정 시간 */
          updatedAt: string;
        };
        /** 프로젝트 테이블 삽입 시 사용하는 타입 */
        Insert: {
          /** 프로젝트 고유 식별자 (필수) */
          id: string;
          /** 프로젝트 소유자 사용자 ID (필수) */
          userId: string;
          /** 프로젝트 이름 (필수) */
          name: string;
          /** Git 저장소 URL (필수) */
          repositoryUrl: string;
          /** 저장소 이름 (필수) */
          repositoryName: string;
          /** 기본 브랜치 (필수) */
          branch: string;
          /** AWS CodeBuild 프로젝트명 (필수) */
          codebuildProjectName: string;
          /** AWS 리전 (선택, 기본값: null) */
          awsRegion?: string | null;
          /** 프로젝트 상태 (선택, 기본값: 'pending') */
          status?: 'active' | 'inactive' | 'pending';
          /** 생성 시간 (자동 설정) */
          createdAt?: string;
          /** 마지막 수정 시간 (자동 설정) */
          updatedAt?: string;
        };
        /** 프로젝트 테이블 업데이트 시 사용하는 타입 */
        Update: {
          /** 프로젝트 고유 식별자 (일반적으로 업데이트하지 않음) */
          id?: string;
          /** 프로젝트 소유자 사용자 ID (일반적으로 업데이트하지 않음) */
          userId?: string;
          /** 프로젝트 이름 (선택) */
          name?: string;
          /** Git 저장소 URL (선택) */
          repositoryUrl?: string;
          /** 저장소 이름 (선택) */
          repositoryName?: string;
          /** 기본 브랜치 (선택) */
          branch?: string;
          /** AWS CodeBuild 프로젝트명 (선택) */
          codebuildProjectName?: string;
          /** AWS 리전 (선택) */
          awsRegion?: string | null;
          /** 프로젝트 상태 (선택) */
          status?: 'active' | 'inactive' | 'pending';
          /** 생성 시간 (일반적으로 업데이트하지 않음) */
          createdAt?: string;
          /** 마지막 수정 시간 (자동 설정) */
          updatedAt?: string;
        };
      };
      /** 빌드 이력 테이블 */
      build_histories: {
        /** 빌드 이력 테이블의 행 타입 */
        Row: {
          /** 빌드 이력 고유 식별자 */
          id: string;
          /** 빌드를 실행한 사용자 ID */
          user_id: string;
          /** 빌드 대상 프로젝트 ID */
          project_id: string;
          /** AWS CodeBuild 빌드 ID */
          aws_build_id: string;
          /** 빌드 실행 상태 */
          build_execution_status:
            | 'pending'
            | 'in_progress'
            | 'succeeded'
            | 'failed'
            | 'stopped'
            | 'timed_out'
            | 'fault';
          /** 빌드 스펙 설정 (JSON) */
          build_spec: Json;
          /** 환경 변수 (JSON) */
          environment_variables: Json | null;
          /** 빌드 시작 시간 */
          start_time: string | null;
          /** 빌드 종료 시간 */
          end_time: string | null;
          /** 빌드 소요 시간 (초) */
          duration_seconds: number | null;
          /** CloudWatch 로그 URL */
          logs_url: string | null;
          /** 빌드 오류 메시지 */
          build_error_message: string | null;
          /** 생성 시간 */
          created_at: string;
          /** 마지막 수정 시간 */
          updated_at: string;
        };
        /** 빌드 이력 테이블 삽입 시 사용하는 타입 */
        Insert: {
          /** 빌드 이력 고유 식별자 (자동 생성) */
          id?: string;
          /** 빌드를 실행한 사용자 ID (필수) */
          user_id: string;
          /** 빌드 대상 프로젝트 ID (필수) */
          project_id: string;
          /** AWS CodeBuild 빌드 ID (필수) */
          aws_build_id: string;
          /** 빌드 실행 상태 (선택, 기본값: 'pending') */
          build_execution_status?:
            | 'pending'
            | 'in_progress'
            | 'succeeded'
            | 'failed'
            | 'stopped'
            | 'timed_out'
            | 'fault';
          /** 빌드 스펙 설정 (필수) */
          build_spec: Json;
          /** 환경 변수 (선택) */
          environment_variables?: Json | null;
          /** 빌드 시작 시간 (선택) */
          start_time?: string | null;
          /** 빌드 종료 시간 (선택) */
          end_time?: string | null;
          /** 빌드 소요 시간 (선택) */
          duration_seconds?: number | null;
          /** CloudWatch 로그 URL (선택) */
          logs_url?: string | null;
          /** 빌드 오류 메시지 (선택) */
          build_error_message?: string | null;
          /** 생성 시간 (자동 설정) */
          created_at?: string;
          /** 마지막 수정 시간 (자동 설정) */
          updated_at?: string;
        };
        /** 빌드 이력 테이블 업데이트 시 사용하는 타입 */
        Update: {
          /** 빌드 이력 고유 식별자 (일반적으로 업데이트하지 않음) */
          id?: string;
          /** 빌드를 실행한 사용자 ID (일반적으로 업데이트하지 않음) */
          user_id?: string;
          /** 빌드 대상 프로젝트 ID (일반적으로 업데이트하지 않음) */
          project_id?: string;
          /** AWS CodeBuild 빌드 ID (일반적으로 업데이트하지 않음) */
          aws_build_id?: string;
          /** 빌드 실행 상태 (선택) */
          build_execution_status?:
            | 'pending'
            | 'in_progress'
            | 'succeeded'
            | 'failed'
            | 'stopped'
            | 'timed_out'
            | 'fault';
          /** 빌드 스펙 설정 (선택) */
          build_spec?: Json;
          /** 환경 변수 (선택) */
          environment_variables?: Json | null;
          /** 빌드 시작 시간 (선택) */
          start_time?: string | null;
          /** 빌드 종료 시간 (선택) */
          end_time?: string | null;
          /** 빌드 소요 시간 (선택) */
          duration_seconds?: number | null;
          /** CloudWatch 로그 URL (선택) */
          logs_url?: string | null;
          /** 빌드 오류 메시지 (선택) */
          build_error_message?: string | null;
          /** 생성 시간 (일반적으로 업데이트하지 않음) */
          created_at?: string;
          /** 마지막 수정 시간 (자동 설정) */
          updated_at?: string;
        };
      };
      /** 빌드 실행 단계 테이블 */
      build_execution_phases: {
        /** 빌드 실행 단계 테이블의 행 타입 */
        Row: {
          /** 빌드 단계 고유 식별자 */
          id: string;
          /** 빌드 이력 ID (build_histories.id 참조) */
          build_history_id: string;
          /** 빌드 단계 타입 (예: BUILD, INSTALL, TEST) */
          phase_type: string;
          /** 빌드 단계 상태 (예: SUCCEEDED, FAILED, IN_PROGRESS) */
          phase_status: string;
          /** 단계 시작 시간 */
          phase_start_time: string | null;
          /** 단계 종료 시간 */
          phase_end_time: string | null;
          /** 단계 소요 시간 (초) */
          phase_duration_seconds: number | null;
          /** 단계별 컨텍스트 메시지 또는 오류 정보 */
          phase_context_message: string | null;
          /** 생성 시간 */
          created_at: string;
        };
        /** 빌드 실행 단계 테이블 삽입 시 사용하는 타입 */
        Insert: {
          /** 빌드 단계 고유 식별자 (자동 생성) */
          id?: string;
          /** 빌드 이력 ID (필수) */
          build_history_id: string;
          /** 빌드 단계 타입 (필수) */
          phase_type: string;
          /** 빌드 단계 상태 (필수) */
          phase_status: string;
          /** 단계 시작 시간 (선택) */
          phase_start_time?: string | null;
          /** 단계 종료 시간 (선택) */
          phase_end_time?: string | null;
          /** 단계 소요 시간 (선택) */
          phase_duration_seconds?: number | null;
          /** 단계별 컨텍스트 메시지 (선택) */
          phase_context_message?: string | null;
          /** 생성 시간 (자동 설정) */
          created_at?: string;
        };
        /** 빌드 실행 단계 테이블 업데이트 시 사용하는 타입 */
        Update: {
          /** 빌드 단계 고유 식별자 (일반적으로 업데이트하지 않음) */
          id?: string;
          /** 빌드 이력 ID (일반적으로 업데이트하지 않음) */
          build_history_id?: string;
          /** 빌드 단계 타입 (선택) */
          phase_type?: string;
          /** 빌드 단계 상태 (선택) */
          phase_status?: string;
          /** 단계 시작 시간 (선택) */
          phase_start_time?: string | null;
          /** 단계 종료 시간 (선택) */
          phase_end_time?: string | null;
          /** 단계 소요 시간 (선택) */
          phase_duration_seconds?: number | null;
          /** 단계별 컨텍스트 메시지 (선택) */
          phase_context_message?: string | null;
          /** 생성 시간 (일반적으로 업데이트하지 않음) */
          created_at?: string;
        };
      };
    };
    /** 데이터베이스 뷰들 (현재 없음) */
    Views: {
      [_ in never]: never;
    };
    /** 데이터베이스 함수들 (현재 없음) */
    Functions: {
      [_ in never]: never;
    };
    /** 데이터베이스 열거형들 (현재 없음) */
    Enums: {
      [_ in never]: never;
    };
  };
};
