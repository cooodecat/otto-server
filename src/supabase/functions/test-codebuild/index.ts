import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { CodeBuildClient, CreateProjectCommand, StartBuildCommand } from "https://esm.sh/@aws-sdk/client-codebuild@3"

// AWS CodeBuild 설정
const AWS_REGION = Deno.env.get('AWS_REGION') ?? 'ap-northeast-2'
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID') ?? ''
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? ''
const AWS_CODEBUILD_SERVICE_ROLE = Deno.env.get('AWS_CODEBUILD_SERVICE_ROLE') ?? ''
const CODEBUILD_ARTIFACTS_BUCKET = Deno.env.get('CODEBUILD_ARTIFACTS_BUCKET') ?? ''

// CodeBuild 클라이언트 생성
function createCodeBuildClient(): CodeBuildClient {
    return new CodeBuildClient({
        region: AWS_REGION,
        credentials: {
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY
        }
    })
}

// 기본 buildspec 생성
function createDefaultBuildspec(): string {
    return `version: 0.2
phases:
  pre_build:
    commands:
      - echo Installing dependencies...
      - npm install || yarn install || echo "No package manager found"
  build:
    commands:
      - echo Build started
      - npm run build || yarn build || echo "No build script found"
  post_build:
    commands:
      - echo Build completed
artifacts:
  files:
    - '**/*'
  base-directory: '.'
`
}

// CodeBuild 프로젝트 생성 테스트
async function testCreateCodeBuildProject() {
    try {
        const codebuildClient = createCodeBuildClient()

        const projectName = `otto-test-${Date.now()}`
        const logGroupName = `otto-test-${Date.now()}-cloudwatch`
        const artifactsName = `otto-test-${Date.now()}-artifacts`

        console.log('Creating CodeBuild project:', {
            projectName,
            logGroupName,
            artifactsName,
            bucket: CODEBUILD_ARTIFACTS_BUCKET,
            serviceRole: AWS_CODEBUILD_SERVICE_ROLE
        })

        const createProjectCommand = new CreateProjectCommand({
            name: projectName,
            source: {
                type: 'GITHUB',
                location: 'https://github.com/octocat/Hello-World.git', // 테스트용 공개 저장소
                sourceVersion: 'refs/heads/main',
                buildspec: createDefaultBuildspec()
            },
            artifacts: {
                type: 'S3',
                location: CODEBUILD_ARTIFACTS_BUCKET,
                name: artifactsName,
                packaging: 'ZIP'
            },
            environment: {
                type: 'LINUX_CONTAINER',
                image: 'aws/codebuild/standard:7.0',
                computeType: 'BUILD_GENERAL1_MEDIUM'
            },
            serviceRole: AWS_CODEBUILD_SERVICE_ROLE,
            timeoutInMinutes: 60,
            logsConfig: {
                cloudWatchLogs: {
                    status: 'ENABLED',
                    groupName: logGroupName
                }
            }
        })

        const result = await codebuildClient.send(createProjectCommand)

        return {
            success: true,
            projectName: result.project?.name,
            projectArn: result.project?.arn,
            logGroupName
        }
    } catch (error) {
        console.error('CodeBuild test error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

serve(async (req) => {
    try {
        const url = new URL(req.url)
        const method = req.method
        const path = url.pathname

        // CORS 헤더 설정
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        }

        // OPTIONS 요청 처리
        if (method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: corsHeaders })
        }

        // 환경 변수 확인
        if (method === 'GET' && path === '/test-codebuild/test-codebuild/env') {
            return new Response(JSON.stringify({
                awsRegion: AWS_REGION,
                hasAccessKey: !!AWS_ACCESS_KEY_ID,
                hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
                hasServiceRole: !!AWS_CODEBUILD_SERVICE_ROLE,
                hasBucket: !!CODEBUILD_ARTIFACTS_BUCKET
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            })
        }

        // AWS 연결 테스트
        if (method === 'GET' && path === '/test-codebuild/test-codebuild/aws-test') {
            try {
                const codebuildClient = createCodeBuildClient()
                // 간단한 AWS 연결 테스트 (프로젝트 목록 조회)
                const result = await codebuildClient.listProjects({})
                return new Response(JSON.stringify({
                    success: true,
                    message: 'AWS CodeBuild 연결 성공',
                    projectCount: result.projects?.length || 0
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                })
            } catch (error) {
                return new Response(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    errorType: error instanceof Error ? error.constructor.name : 'Unknown'
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                })
            }
        }

        // CodeBuild 프로젝트 생성 테스트
        if (method === 'POST' && path === '/test-codebuild/test-codebuild/create') {
            const result = await testCreateCodeBuildProject()
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            })
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })

    } catch (error) {
        console.error('Function error:', error)
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Unknown error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})
