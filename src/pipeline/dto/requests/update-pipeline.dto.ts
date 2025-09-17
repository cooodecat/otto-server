export interface UpdatePipelineDto {
  name?: string;
  flowData?: {
    nodes: any[];
    edges: any[];
  };
  env?: Record<string, any>;
}
