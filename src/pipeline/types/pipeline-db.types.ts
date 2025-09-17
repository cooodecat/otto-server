/**
 * Database types for pipeline table
 */
export interface PipelineDB {
  pipeline_id: string;
  project_id: string;
  name?: string | null;
  data: {
    nodes: Array<{
      id: string;
      type?: string;
      position?: { x: number; y: number };
      data?: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type?: string;
      data?: Record<string, unknown>;
    }>;
  };
  env?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
}

export type PipelineInsert = Omit<
  PipelineDB,
  'pipeline_id' | 'created_at' | 'updated_at'
>;
export type PipelineUpdate = Partial<
  Omit<PipelineDB, 'pipeline_id' | 'project_id' | 'created_at'>
>;
