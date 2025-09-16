export interface UpdatePipelineDto {
  flowData?: {
    nodes: any[];
    edges: any[];
  };
  env?: Record<string, any>;
}