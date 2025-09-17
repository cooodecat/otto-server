export interface CreatePipelineDto {
  projectId: string;
  name: string;
  description?: string;
  flowData: {
    nodes: any[];
    edges: any[];
  };
}