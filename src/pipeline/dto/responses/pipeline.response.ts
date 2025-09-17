export interface PipelineResponse {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  flowData: {
    nodes: any[];
    edges: any[];
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelinesListResponse {
  pipelines: PipelineResponse[];
  total: number;
}