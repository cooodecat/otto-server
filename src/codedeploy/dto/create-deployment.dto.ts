import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { DeploymentConfig } from '../types/codedeploy.types';

export class CreateDeploymentDto {
  @IsString()
  @IsNotEmpty()
  buildId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsObject()
  @IsNotEmpty()
  nodeConfig: DeploymentConfig;
}

export class GetDeploymentStatusDto {
  @IsString()
  @IsNotEmpty()
  deploymentId: string;
}