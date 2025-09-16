import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Octokit } from "https://esm.sh/@octokit/rest@19.0.0"
import { createAppAuth } from "https://esm.sh/@octokit/auth-app@4.0.0"
// AWS CodeBuild 관련 코드는 별도 서비스로 분리됨

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
)

// GitHub App 설정
const GITHUB_APP_ID = Deno.env.get('OTTO_GITHUB_APP_ID') ?? ''
const GITHUB_APP_PRIVATE_KEY = Deno.env.get('OTTO_GITHUB_APP_PRIVATE_KEY') ?? ''

// AWS CodeBuild 설정
const AWS_REGION = Deno.env.get('AWS_REGION') ?? 'ap-northeast-2'
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID') ?? ''
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? ''
const AWS_CODEBUILD_SERVICE_ROLE = Deno.env.get('AWS_CODEBUILD_SERVICE_ROLE') ?? ''
const CODEBUILD_ARTIFACTS_BUCKET = Deno.env.get('CODEBUILD_ARTIFACTS_BUCKET') ?? ''

// GitHub App 인증 설정 (Installation ID는 동적으로 사용)
const auth = createAppAuth({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
})

// JWT 토큰에서 사용자 정보 추출
async function getUserFromToken(authHeader: string) {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
        throw new Error('Invalid token')
    }

    return user
}

// CORS 헤더 설정
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
}

// 에러 응답 생성
function createErrorResponse(message: string, status: number = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        }
    })
}

// 성공 응답 생성
function createSuccessResponse(data: Record<string, unknown>, status: number = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        }
    })
}

// AWS Signature v4 구현
async function createSignature(
    method: string,
    host: string,
    path: string,
    queryString: string,
    headers: Record<string, string>,
    payload: string,
    service: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string
): Promise<string> {
    const algorithm = 'AWS4-HMAC-SHA256'
    const date = new Date()
    const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, '')
    const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '')

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`

    // Canonical request
    const canonicalHeaders = Object.keys(headers)
        .sort()
        .map(key => `${key.toLowerCase()}:${headers[key]}`)
        .join('\n') + '\n'

    const signedHeaders = Object.keys(headers)
        .sort()
        .map(key => key.toLowerCase())
        .join(';')

    const canonicalRequest = [
        method,
        path,
        queryString,
        canonicalHeaders,
        signedHeaders,
        await sha256(payload)
    ].join('\n')

    // String to sign
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        await sha256(canonicalRequest)
    ].join('\n')

    // Signing key
    const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp)
    const kRegion = await hmacSha256(kDate, region)
    const kService = await hmacSha256(kRegion, service)
    const kSigning = await hmacSha256(kService, 'aws4_request')

    const signature = await hmacSha256(kSigning, stringToSign)

    return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${arrayBufferToHex(signature)}`
}

// SHA256 해시 함수
async function sha256(message: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(message)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return arrayBufferToHex(hashBuffer)
}

// HMAC-SHA256 함수
async function hmacSha256(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder()
    const keyData = typeof key === 'string' ? encoder.encode(key) : key
    const messageData = encoder.encode(message)

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )

    return await crypto.subtle.sign('HMAC', cryptoKey, messageData)
}

// ArrayBuffer를 Hex 문자열로 변환
function arrayBufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer)
    return Array.from(byteArray, byte => byte.toString(16).padStart(2, '0')).join('')
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

// CodeBuild 프로젝트 생성
async function createCodeBuildProject(
    projectName: string,
    githubRepoUrl: string,
    selectedBranch: string,
    userId: string
): Promise<{ projectName: string; projectArn: string; logGroupName: string }> {
    const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9-]/g, '-')
    const codebuildProjectName = `otto-${sanitizedProjectName}-${userId}`
    const logGroupName = `otto-${sanitizedProjectName}-${userId}-cloudwatch`
    const artifactsName = `otto-${sanitizedProjectName}-${userId}-artifacts`

    const payload = {
        name: codebuildProjectName,
        source: {
            type: 'GITHUB',
            location: githubRepoUrl,
            sourceVersion: `refs/heads/${selectedBranch}`,
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
    }

    const payloadString = JSON.stringify(payload)
    const host = `codebuild.${AWS_REGION}.amazonaws.com`
    const path = '/'
    const amzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '')

    const headers = {
        'Host': host,
        'X-Amz-Date': amzDate,
        'X-Amz-Target': 'CodeBuild_20161006.CreateProject',
        'Content-Type': 'application/x-amz-json-1.1'
    }

    const authHeader = await createSignature(
        'POST',
        host,
        path,
        '',
        headers,
        payloadString,
        'codebuild',
        AWS_REGION,
        AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY
    )

    const response = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers: {
            ...headers,
            'Authorization': authHeader
        },
        body: payloadString
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error('CodeBuild API Error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
        })
        throw new Error(`CodeBuild project creation failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json() as { project: { arn: string; name: string } }

    if (!result.project?.arn || !result.project?.name) {
        throw new Error('CodeBuild project creation failed: missing project data')
    }

    return {
        projectName: result.project.name,
        projectArn: result.project.arn,
        logGroupName
    }
}

// 프로젝트 생성
async function createProject(userId: string, body: any) {
    const { name, description } = body

    const { data, error } = await supabase
        .from('projects')
        .insert({
            name: name.trim(),
            description,
            github_owner: '',
            github_repo_id: '',
            github_repo_name: '',
            github_repo_url: '',
            user_id: userId,
        })
        .select(`
      project_id,
      name,
      description,
      github_owner,
      github_repo_id,
      github_repo_name,
      github_repo_url,
      selected_branch,
      created_at,
      updated_at
    `)
        .single()

    if (error) {
        if (error.code === '23505') {
            throw new Error('같은 이름의 프로젝트가 이미 존재합니다')
        }
        throw new Error(error.message)
    }

    return {
        projectId: data.project_id,
        name: data.name,
        webhookUrl: null,
        user: {
            userId: userId,
            email: `${userId}@github.user`,
            name: 'User',
        },
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    }
}

// GitHub 연동 프로젝트 생성
async function createProjectWithGithub(userId: string, body: Record<string, unknown>) {
    const {
        name,
        description,
        installationId,
        githubRepoId,
        githubRepoUrl,
        githubRepoName,
        githubOwner,
        selectedBranch
    } = body as {
        name: string
        description: string
        installationId: string
        githubRepoId: string
        githubRepoUrl: string
        githubRepoName: string
        githubOwner: string
        selectedBranch: string
    }

    // GitHub Installation 확인
    const { data: installation, error: installError } = await supabase
        .from('github_installations')
        .select('*')
        .eq('installation_id', installationId)
        .eq('user_id', userId)
        .single()

    if (installError || !installation) {
        throw new Error('유효하지 않은 GitHub 설치 ID입니다')
    }

    // 1. DB에 프로젝트 레코드 생성 (PENDING 상태)
    const { data, error } = await supabase
        .from('projects')
        .insert({
            name: name.trim(),
            description,
            github_owner: githubOwner,
            github_repo_id: githubRepoId,
            github_repo_name: githubRepoName,
            github_repo_url: githubRepoUrl,
            installation_id: installationId,
            user_id: userId,
            selected_branch: selectedBranch || 'main',
            codebuild_status: 'PENDING'
        })
        .select(`
      project_id,
      name,
      description,
      github_owner,
      github_repo_id,
      github_repo_name,
      github_repo_url,
      selected_branch,
      created_at,
      updated_at,
      codebuild_status
    `)
        .single()

    if (error) {
        if (error.code === '23505') {
            throw new Error('이 레포지토리는 이미 다른 프로젝트에 연결되어 있습니다')
        }
        throw new Error(error.message)
    }

    // 2. CodeBuild 프로젝트 생성
    try {
        const codebuildResult = await createCodeBuildProject(
            name,
            githubRepoUrl,
            selectedBranch || 'main',
            userId
        )

        // 3. 성공 시 CodeBuild 정보 업데이트
        const { data: updatedData, error: updateError } = await supabase
            .from('projects')
            .update({
                codebuild_status: 'CREATED',
                codebuild_project_name: codebuildResult.projectName,
                codebuild_project_arn: codebuildResult.projectArn,
                cloudwatch_log_group_name: codebuildResult.logGroupName
            })
            .eq('project_id', data.project_id)
            .select()
            .single()

        if (updateError) {
            console.error('CodeBuild 정보 업데이트 실패:', updateError)
        }

        return {
            project: {
                projectId: data.project_id,
                name: data.name,
                description: data.description,
                githubRepoId: data.github_repo_id,
                selectedBranch: data.selected_branch,
                githubRepoUrl: data.github_repo_url,
                githubRepoName: data.github_repo_name,
                githubOwner: data.github_owner,
                createdAt: data.created_at,
                codebuildStatus: 'CREATED',
                codebuildProjectName: codebuildResult.projectName,
                codebuildProjectArn: codebuildResult.projectArn,
                cloudwatchLogGroupName: codebuildResult.logGroupName
            },
        }
    } catch (codebuildError) {
        // 4. CodeBuild 생성 실패 시 상태 업데이트
        const errorMessage = codebuildError instanceof Error ? codebuildError.message : 'Unknown CodeBuild error'

        const { error: failUpdateError } = await supabase
            .from('projects')
            .update({
                codebuild_status: 'FAILED',
                codebuild_error_message: errorMessage
            })
            .eq('project_id', data.project_id)

        if (failUpdateError) {
            console.error('CodeBuild 실패 상태 업데이트 실패:', failUpdateError)
        }

        return {
            project: {
                projectId: data.project_id,
                name: data.name,
                description: data.description,
                githubRepoId: data.github_repo_id,
                selectedBranch: data.selected_branch,
                githubRepoUrl: data.github_repo_url,
                githubRepoName: data.github_repo_name,
                githubOwner: data.github_owner,
                createdAt: data.created_at,
                codebuildStatus: 'FAILED',
                codebuildErrorMessage: errorMessage
            },
        }
    }
}

// 사용자 프로젝트 목록 조회
async function getUserProjects(userId: string) {
    const { data, error } = await supabase
        .from('projects')
        .select(`
      project_id,
      name,
      description,
      github_owner,
      github_repo_id,
      github_repo_name,
      github_repo_url,
      selected_branch,
      installation_id,
      created_at,
      updated_at,
      github_installations (
        installation_id,
        github_installation_id,
        account_login,
        account_type
      )
    `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) {
        throw new Error(error.message)
    }

    return data.map(project => ({
        ...project,
        projectId: project.project_id,
        userID: userId,
        webhookUrl: null,
        installation: project.github_installations ? {
            installationId: project.github_installations.installation_id,
            githubInstallationId: project.github_installations.github_installation_id,
            accountLogin: project.github_installations.account_login,
            accountType: project.github_installations.account_type,
        } : null,
    }))
}

// 프로젝트 상세 정보 조회
async function getProjectDetail(userId: string, projectId: string) {
    const { data, error } = await supabase
        .from('projects')
        .select(`
      project_id,
      name,
      description,
      github_owner,
      github_repo_id,
      github_repo_name,
      github_repo_url,
      selected_branch,
      installation_id,
      created_at,
      updated_at,
      github_installations (
        installation_id,
        github_installation_id,
        account_login,
        account_type
      )
    `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

    if (error) {
        if (error.code === 'PGRST116') {
            throw new Error('프로젝트를 찾을 수 없습니다')
        }
        throw new Error(error.message)
    }

    return {
        ...data,
        projectId: data.project_id,
        userId: userId,
        user: {
            userId: userId,
            email: `${userId}@github.user`,
            name: 'User',
        },
        installation: data.github_installations ? {
            installationId: data.github_installations.installation_id,
            githubInstallationId: data.github_installations.github_installation_id,
            accountLogin: data.github_installations.account_login,
            accountType: data.github_installations.account_type,
        } : null,
        pipelines: [],
    }
}

// 저장소 연결
async function connectRepository(userId: string, projectId: string, body: any) {
    const {
        githubRepoId,
        githubRepoUrl,
        githubRepoName,
        githubOwner,
        selectedBranch,
        installationId
    } = body

    // 프로젝트 소유권 확인
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

    if (projectError || !project) {
        throw new Error('프로젝트를 찾을 수 없거나 접근 권한이 없습니다')
    }

    // 설치 ID가 제공된 경우 권한 확인
    if (installationId) {
        const { data: installation, error: installError } = await supabase
            .from('github_installations')
            .select('*')
            .eq('installation_id', installationId)
            .eq('user_id', userId)
            .single()

        if (installError || !installation) {
            throw new Error('해당 GitHub 설치에 대한 권한이 없습니다')
        }
    }

    const { data, error } = await supabase
        .from('projects')
        .update({
            github_repo_id: githubRepoId,
            github_repo_url: githubRepoUrl,
            github_repo_name: githubRepoName,
            github_owner: githubOwner,
            selected_branch: selectedBranch,
            installation_id: installationId,
        })
        .eq('project_id', projectId)
        .select(`
      project_id,
      name,
      description,
      github_owner,
      github_repo_id,
      github_repo_name,
      github_repo_url,
      selected_branch,
      installation_id,
      created_at,
      updated_at
    `)
        .single()

    if (error) {
        if (error.code === '23505') {
            throw new Error('이 레포지토리는 이미 다른 프로젝트에 연결되어 있습니다')
        }
        throw new Error(error.message)
    }

    return {
        ...data,
        projectId: data.project_id,
        userId: userId,
        user: {
            userId: userId,
            username: 'user',
            email: 'user@github.user',
            name: 'User',
        },
    }
}

// 브랜치 목록 조회
async function getRepositoryBranches(userId: string, projectId: string) {
    // 프로젝트 소유권 확인
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select(`
      project_id,
      github_owner,
      github_repo_name,
      installation_id,
      github_installations (
        github_installation_id
      )
    `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

    if (projectError || !project) {
        throw new Error('프로젝트를 찾을 수 없습니다')
    }

    if (!project.installation_id || !project.github_installations) {
        throw new Error('이 프로젝트에는 GitHub 설치 정보가 없습니다')
    }

    // GitHub API로 브랜치 목록 조회 (동적 Installation ID 사용)
    const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: project.github_installations.github_installation_id,
        },
    })

    const { data: branches } = await octokit.rest.repos.listBranches({
        owner: project.github_owner,
        repo: project.github_repo_name,
    })

    return branches.map(branch => ({
        name: branch.name,
        commit: {
            sha: branch.commit.sha,
            url: branch.commit.url,
        },
        protected: branch.protected,
    }))
}

// CodeBuild 재시도
async function retryCodeBuild(userId: string, projectId: string) {
    // 프로젝트 소유권 확인
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select(`
            project_id,
            name,
            github_repo_url,
            selected_branch,
            codebuild_status
        `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

    if (projectError || !project) {
        throw new Error('프로젝트를 찾을 수 없거나 접근 권한이 없습니다')
    }

    if (project.codebuild_status !== 'FAILED') {
        throw new Error('FAILED 상태의 프로젝트만 재시도할 수 있습니다')
    }

    // 재시도 상태로 변경
    const { error: pendingError } = await supabase
        .from('projects')
        .update({
            codebuild_status: 'PENDING',
            codebuild_error_message: null
        })
        .eq('project_id', projectId)

    if (pendingError) {
        throw new Error('재시도 상태 업데이트 실패')
    }

    try {
        // CodeBuild 프로젝트 생성
        const codebuildResult = await createCodeBuildProject(
            project.name,
            project.github_repo_url,
            project.selected_branch,
            userId
        )

        // 성공 시 업데이트
        const { data: updatedData, error: updateError } = await supabase
            .from('projects')
            .update({
                codebuild_status: 'CREATED',
                codebuild_project_name: codebuildResult.projectName,
                codebuild_project_arn: codebuildResult.projectArn,
                cloudwatch_log_group_name: codebuildResult.logGroupName,
                codebuild_error_message: null
            })
            .eq('project_id', projectId)
            .select()
            .single()

        if (updateError) {
            throw new Error('성공 상태 업데이트 실패')
        }

        return {
            message: 'CodeBuild 프로젝트가 성공적으로 생성되었습니다',
            codebuildStatus: 'CREATED',
            codebuildProjectName: codebuildResult.projectName,
            codebuildProjectArn: codebuildResult.projectArn,
            cloudwatchLogGroupName: codebuildResult.logGroupName
        }
    } catch (codebuildError) {
        // 실패 시 업데이트
        const errorMessage = codebuildError instanceof Error ? codebuildError.message : 'Unknown CodeBuild error'

        const { error: failError } = await supabase
            .from('projects')
            .update({
                codebuild_status: 'FAILED',
                codebuild_error_message: errorMessage
            })
            .eq('project_id', projectId)

        if (failError) {
            console.error('CodeBuild 실패 상태 업데이트 실패:', failError)
        }

        throw new Error(`CodeBuild 재시도 실패: ${errorMessage}`)
    }
}

// CodeBuild 재시도는 별도 서비스에서 처리

// 선택된 브랜치 변경
async function updateSelectedBranch(userId: string, projectId: string, body: Record<string, unknown>) {
    const { branchName } = body as { branchName: string }

    // 프로젝트 소유권 확인
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select(`
      project_id,
      github_owner,
      github_repo_name,
      installation_id,
      github_installations (
        github_installation_id
      )
    `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

    if (projectError || !project) {
        throw new Error('프로젝트를 찾을 수 없거나 접근 권한이 없습니다')
    }

    // 브랜치 존재 확인 (선택사항)
    if (project.installation_id && project.github_installations) {
        try {
            const octokit = new Octokit({
                authStrategy: createAppAuth,
                auth: {
                    appId: GITHUB_APP_ID,
                    privateKey: GITHUB_APP_PRIVATE_KEY,
                    installationId: project.github_installations.github_installation_id,
                },
            })

            const { data: branches } = await octokit.rest.repos.listBranches({
                owner: project.github_owner,
                repo: project.github_repo_name,
            })

            const branchExists = branches.some(branch => branch.name === branchName)
            if (!branchExists) {
                throw new Error(`브랜치 '${branchName}'가 존재하지 않습니다`)
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.warn('브랜치 존재 확인 실패:', errorMessage)
        }
    }

    const { data, error } = await supabase
        .from('projects')
        .update({
            selected_branch: branchName,
        })
        .eq('project_id', projectId)
        .select(`
      project_id,
      name,
      description,
      github_owner,
      github_repo_id,
      github_repo_name,
      github_repo_url,
      selected_branch,
      installation_id,
      created_at,
      updated_at
    `)
        .single()

    if (error) {
        throw new Error(error.message)
    }

    return {
        ...data,
        projectId: data.project_id,
        userId: userId,
        user: {
            userId: userId,
            username: 'user',
            email: 'user@github.user',
            name: 'User',
        },
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

        // 인증 헤더 확인
        const authHeader = req.headers.get('authorization')
        if (!authHeader) {
            return createErrorResponse('로그인이 필요합니다', 401)
        }

        // 사용자 정보 추출
        const user = await getUserFromToken(authHeader)
        const userId = user.id

        // 라우팅 처리
        if (method === 'POST' && path === '/projects/projects') {
            // POST /projects/projects - 프로젝트 생성
            const body = await req.json()
            const result = await createProject(userId, body)
            return createSuccessResponse(result)
        }

        if (method === 'POST' && path === '/projects/projects/with-github') {
            // POST /projects/projects/with-github - GitHub 연동 프로젝트 생성
            const body = await req.json()
            const result = await createProjectWithGithub(userId, body)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path === '/projects/projects') {
            // GET /projects/projects - 사용자 프로젝트 목록
            const result = await getUserProjects(userId)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.startsWith('/projects/projects/') && !path.includes('/repositories')) {
            // GET /projects/projects/:id - 프로젝트 상세 정보
            const projectId = path.split('/')[3]
            const result = await getProjectDetail(userId, projectId)
            return createSuccessResponse(result)
        }

        if (method === 'POST' && path.includes('/repositories') && !path.includes('/branches')) {
            // POST /projects/projects/:id/repositories - 저장소 연결
            const pathParts = path.split('/')
            const projectId = pathParts[3]
            const body = await req.json()
            const result = await connectRepository(userId, projectId, body)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.includes('/repositories/') && path.includes('/branches')) {
            // GET /projects/projects/:id/repositories/:repoId/branches - 프로젝트의 브랜치 목록
            const pathParts = path.split('/')
            const projectId = pathParts[3]
            const result = await getRepositoryBranches(userId, projectId)
            return createSuccessResponse(result)
        }

        if (method === 'PATCH' && path.includes('/repositories/') && path.includes('/branch')) {
            // PATCH /projects/projects/:id/repositories/:repoId/branch - 선택된 브랜치 변경
            const pathParts = path.split('/')
            const projectId = pathParts[3]
            const body = await req.json()
            const result = await updateSelectedBranch(userId, projectId, body)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.includes('/detail')) {
            // GET /projects/projects/:id/detail - 프로젝트 상세 정보 (기존 API와 동일)
            const pathParts = path.split('/')
            const projectId = pathParts[3]
            const result = await getProjectDetail(userId, projectId)
            return createSuccessResponse(result)
        }

        if (method === 'POST' && path.includes('/retry-codebuild')) {
            // POST /projects/projects/:id/retry-codebuild - CodeBuild 재시도
            const pathParts = path.split('/')
            const projectId = pathParts[3]
            const result = await retryCodeBuild(userId, projectId)
            return createSuccessResponse(result)
        }

        return createErrorResponse('Not Found', 404)

    } catch (error) {
        console.error('Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
        return createErrorResponse(errorMessage, 500)
    }
})
