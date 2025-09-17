// Pipeline related types

export interface ReactFlowData {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

export interface ReactFlowNode {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
  };
  data: Record<string, any>;
  selected?: boolean;
  dragging?: boolean;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  data?: Record<string, any>;
}

export interface PipelineEntity {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  flowData: ReactFlowData;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectEntity {
  id: string;
  name: string;
  description?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
