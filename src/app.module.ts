import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CodeBuildModule } from './codebuild/codebuild.module';
import { CodeDeployModule } from './codedeploy/codedeploy.module';
import { BuildsModule } from './builds/builds.module';
import { CloudWatchLogsModule } from './cloudwatch-logs/cloudwatch-logs.module';
import { GithubIntegrationModule } from './github-integration/github-integration.module';
import { ProjectsModule } from './projects/projects.module';
import { LogsModule } from './logs/logs.module';
import { PipelineModule } from './pipeline/pipeline.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'dev'}`, '.env'],
      expandVariables: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 20, // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    AuthModule,
    BuildsModule,
    CodeBuildModule,
    CodeDeployModule,
    CloudWatchLogsModule,
    GithubIntegrationModule,
    ProjectsModule,
    LogsModule,
    PipelineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
