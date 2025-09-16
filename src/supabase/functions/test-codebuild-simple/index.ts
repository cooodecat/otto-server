import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// AWS CodeBuild 설정
const AWS_REGION = Deno.env.get('AWS_REGION') ?? 'ap-northeast-2'
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID') ?? ''
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? ''
const AWS_CODEBUILD_SERVICE_ROLE = Deno.env.get('AWS_CODEBUILD_SERVICE_ROLE') ?? ''
const CODEBUILD_ARTIFACTS_BUCKET = Deno.env.get('CODEBUILD_ARTIFACTS_BUCKET') ?? ''

// AWS Signature v4 생성 (간단한 버전)
async function createAWSSignature(method: string, url: string, body: string = ''): Promise<string> {
    // 실제로는 더 복잡한 AWS Signature v4가 필요하지만,
    // 테스트 목적으로 간단한 구현
    const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '')
    const credential = `${AWS_ACCESS_KEY_ID}/${timestamp.substr(0, 8)}/${AWS_REGION}/codebuild/aws4_request`

    return `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=host;x-amz-date, Signature=test`
}

// AWS CodeBuild 프로젝트 목록 조회 (순수 HTTP)
async function listCodeBuildProjects() {
    try {
        const url = `https://codebuild.${AWS_REGION}.amazonaws.com/`
        const body = JSON.stringify({})

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'CodeBuild_20161006.ListProjects',
                'Authorization': await createAWSSignature('POST', url, body),
                'X-Amz-Date': new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '')
            },
            body: body
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return await response.json()
    } catch (error) {
        throw new Error(`AWS CodeBuild API 호출 실패: ${error.message}`)
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
        if (method === 'GET' && path === '/test-codebuild-simple/test-codebuild-simple/env') {
            return new Response(JSON.stringify({
                awsRegion: AWS_REGION,
                hasAccessKey: !!AWS_ACCESS_KEY_ID,
                hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
                hasServiceRole: !!AWS_CODEBUILD_SERVICE_ROLE,
                hasBucket: !!CODEBUILD_ARTIFACTS_BUCKET,
                accessKeyLength: AWS_ACCESS_KEY_ID.length,
                secretKeyLength: AWS_SECRET_ACCESS_KEY.length
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            })
        }

        // AWS CodeBuild 프로젝트 목록 조회 테스트
        if (method === 'GET' && path === '/test-codebuild-simple/test-codebuild-simple/list-projects') {
            try {
                const result = await listCodeBuildProjects()
                return new Response(JSON.stringify({
                    success: true,
                    message: 'AWS CodeBuild API 호출 성공',
                    projects: result.projects || [],
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

        // 기본 테스트
        if (method === 'GET' && path === '/test-codebuild-simple/test-codebuild-simple/basic') {
            return new Response(JSON.stringify({
                success: true,
                message: 'Basic function execution successful',
                timestamp: new Date().toISOString(),
                awsRegion: AWS_REGION
            }), {
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
