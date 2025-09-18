export interface DeploymentConfig {
  deploymentName: string;
  environment: 'development' | 'staging' | 'production';
  targetType: 'ec2' | 'ecs' | 'lambda';
  instanceTags?: Array<{
    key: string;
    value: string;
  }>;
  deploymentStrategy: {
    type: 'all-at-once' | 'half-at-a-time' | 'one-at-a-time' | 'blue-green';
    healthCheckUrl?: string;
    waitTimeMinutes?: number;
  };
  rollbackConfig: {
    enabled: boolean;
    onDeploymentFailure: boolean;
    onAlarmThreshold?: boolean;
  };
  notifications?: {
    enabled: boolean;
    events: ('start' | 'success' | 'failure')[];
  };
}

export interface DeploymentResult {
  deploymentId: string;
  applicationName: string;
  deploymentGroupName: string;
  status: string;
  createTime?: Date;
}

export interface DeploymentStatus {
  deploymentId: string;
  status: 'Created' | 'Queued' | 'InProgress' | 'Baking' | 'Succeeded' | 'Failed' | 'Stopped' | 'Ready';
  errorInformation?: {
    code?: string;
    message?: string;
  };
  deploymentOverview?: {
    Pending?: number;
    InProgress?: number;
    Succeeded?: number;
    Failed?: number;
    Stopped?: number;
    Ready?: number;
  };
  createTime?: Date;
  completeTime?: Date;
  progress?: number;
}

export interface S3ArtifactLocation {
  bucket: string;
  key: string;
  bundleType: 'zip' | 'tar' | 'tgz';
}

export interface DeploymentRequest {
  buildId: string;
  projectId: string;
  userId: string;
  nodeConfig: DeploymentConfig;
}