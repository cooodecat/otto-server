import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Octokit } from "https://esm.sh/@octokit/rest@19.0.0"
import { createAppAuth } from "https://esm.sh/@octokit/auth-app@4.0.0"
import { CodeBuildClient, StartBuildCommand } from "https://esm.sh/@aws-sdk/client-codebuild@3"

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
)

// GitHub App 설정
const GITHUB_APP_ID = Deno.env.get('OTTO_GITHUB_APP_ID') ?? ''
const GITHUB_APP_PRIVATE_KEY = Deno.env.get('OTTO_GITHUB_APP_PRIVATE_KEY') ?? ''
const GITHUB_WEBHOOK_SECRET = Deno.env.get('OTTO_GITHUB_WEBHOOK_SECRET') ?? ''

// AWS CodeBuild 설정
const AWS_REGION = Deno.env.get('AWS_REGION') ?? 'ap-northeast-2'
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID') ?? ''
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? ''

// 에러 응답 생성
function createErrorResponse(message: string, status: number = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

// 성공 응답 생성
function createSuccessResponse(data: Record<string, unknown>, status: number = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

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

// CodeBuild 시작
async function startCodeBuild(projectName: string, sourceVersion: string): Promise<void> {
    const codebuildClient = createCodeBuildClient()

    const startBuildCommand = new StartBuildCommand({
        projectName,
        sourceVersion: `refs/heads/${sourceVersion}` // 브랜치 지정
    })

    try {
        const result = await codebuildClient.send(startBuildCommand)
        console.log('CodeBuild started successfully:', {
            projectName,
            buildId: result.build?.id,
            sourceVersion
        })
    } catch (error) {
        console.error('Failed to start CodeBuild:', {
            projectName,
            sourceVersion,
            error: error instanceof Error ? error.message : 'Unknown error'
        })
        throw error
    }
}

// GitHub 웹훅 서명 검증
async function verifyGithubSignature(rawBody: string, signature: string): Promise<boolean> {
    if (!GITHUB_WEBHOOK_SECRET || !signature || !rawBody) {
        console.log('Missing required data for signature verification')
        return false
    }

    try {
        // HMAC-SHA256 서명 생성
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(GITHUB_WEBHOOK_SECRET),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        )

        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
        const expectedDigest = 'sha256=' + Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')

        return expectedDigest === signature
    } catch (error) {
        console.error('Signature verification error:', error)
        return false
    }
}

// 웹훅 엔드포인트 상태 확인
function getWebhookStatus() {
    return {
        ok: true,
        message: 'GitHub webhook endpoint is ready'
    }
}

// Push 이벤트 처리
async function handlePushEvent(payload: any) {
    console.log('Processing push event:', {
        ref: payload.ref,
        after: payload.after,
        repository: payload.repository?.full_name,
    })

    const { ref, after, repository, head_commit, pusher } = payload

    if (!repository || !repository.full_name) {
        console.log('Invalid repository data')
        return
    }

    const fullName = repository.full_name
    const installation = repository.installation

    if (!installation || !installation.id) {
        console.log('Missing installation data')
        return
    }

    const githubInstallationId = installation.id.toString()
    const [githubOwner, githubRepoName] = fullName.split('/')

    if (!githubOwner || !githubRepoName) {
        console.log('Invalid repository name format')
        return
    }

    // 브랜치 정보 추출
    const pushedBranch = ref.replace('refs/heads/', '')
    const commitSha = after || ''
    const commitMessage = head_commit?.message || ''
    const pusherName = pusher?.name || ''

    console.log('Push event details:', {
        repository: fullName,
        githubInstallationId,
        branch: pushedBranch,
        ref,
        after,
        commitMessage,
        pusher: pusherName,
    })

    try {
        // 해당 저장소에 연결된 프로젝트들 조회 (CodeBuild 정보 포함)
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select(`
        project_id,
        selected_branch,
        codebuild_status,
        codebuild_project_name,
        github_installations!inner (
          github_installation_id
        )
      `)
            .eq('github_owner', githubOwner)
            .eq('github_repo_name', githubRepoName)
            .eq('github_installations.github_installation_id', githubInstallationId)
            .eq('codebuild_status', 'CREATED') // CodeBuild가 생성된 프로젝트만

        if (projectsError) {
            console.error('Error fetching projects:', projectsError)
            return
        }

        if (!projects || projects.length === 0) {
            console.log('No projects found for push:', {
                repository: fullName,
                branch: pushedBranch,
                githubInstallationId,
            })
            return
        }

        console.log('Found projects for push event:', {
            repository: fullName,
            branch: pushedBranch,
            projectCount: projects.length,
            projects: projects.map(p => ({
                projectId: p.project_id,
                selectedBranch: p.selected_branch,
            })),
        })

        // 모든 연결된 프로젝트에 대해 처리
        await Promise.all(
            projects.map(async (project) => {
                // 1. Push 이벤트 기록 (히스토리 목적)
                try {
                    await supabase
                        .from('push_events')
                        .insert({
                            project_id: project.project_id,
                            commit_sha: commitSha,
                            commit_message: commitMessage,
                            commit_author_name: pusherName,
                            pushed_at: new Date().toISOString(),
                            branch_name: pushedBranch,
                        })
                } catch (error) {
                    console.warn('Failed to record push event:', error)
                }

                // 2. 해당 브랜치가 프로젝트의 선택된 브랜치인 경우 CodeBuild 트리거
                if (project.selected_branch === pushedBranch && project.codebuild_project_name) {
                    console.log('Triggering CodeBuild for matching branch:', {
                        projectId: project.project_id,
                        selectedBranch: project.selected_branch,
                        pushedBranch,
                        codebuildProjectName: project.codebuild_project_name,
                    })

                    // CodeBuild 시작
                    try {
                        await startCodeBuild(project.codebuild_project_name, pushedBranch)

                        // 빌드 시작 성공 로그
                        console.log('CodeBuild triggered successfully:', {
                            projectId: project.project_id,
                            codebuildProjectName: project.codebuild_project_name,
                            branch: pushedBranch,
                            commitSha
                        })
                    } catch (buildError) {
                        console.error('Failed to trigger CodeBuild:', {
                            projectId: project.project_id,
                            codebuildProjectName: project.codebuild_project_name,
                            error: buildError instanceof Error ? buildError.message : 'Unknown error'
                        })
                    }
                } else {
                    const reason = project.selected_branch !== pushedBranch ? 'branch mismatch' : 'no codebuild project'
                    console.log(`Skipping CodeBuild trigger (${reason}):`, {
                        projectId: project.project_id,
                        selectedBranch: project.selected_branch,
                        pushedBranch,
                        codebuildProjectName: project.codebuild_project_name,
                        codebuildStatus: project.codebuild_status
                    })
                }
            })
        )
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Error processing push event:', {
            repository: fullName,
            branch: pushedBranch,
            error: errorMessage,
        })
    }
}

// Installation 이벤트 처리
function handleInstallationEvent(payload: any) {
    console.log('Processing installation event:', {
        action: payload.action,
        installation: payload.installation?.id,
    })

    // Installation 이벤트는 현재 별도 처리 없음
    // 필요시 사용자 연결 로직 추가
}

// Pull Request 이벤트 처리
function handlePullRequestEvent(payload: any) {
    console.log('Processing pull request event:', {
        action: payload.action,
        pullRequest: payload.pull_request?.number,
    })

    // Pull Request 이벤트는 현재 별도 처리 없음
    // 필요시 PR 기반 빌드 트리거 로직 추가
}

// 웹훅 이벤트 처리
async function handleWebhookEvent(payload: any, eventType: string) {
    console.log('Received webhook event:', {
        eventType,
        hasPayload: !!payload,
    })

    switch (eventType) {
        case 'push':
            await handlePushEvent(payload)
            break
        case 'installation':
            handleInstallationEvent(payload)
            break
        case 'pull_request':
            handlePullRequestEvent(payload)
            break
        default:
            console.log('Unhandled event type:', eventType)
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
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-github-event, x-github-delivery, x-hub-signature-256',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        }

        // OPTIONS 요청 처리
        if (method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: corsHeaders })
        }

        // 라우팅 처리
        if (method === 'GET' && path === '/github-webhook/webhooks/github') {
            // GET /webhooks/github - 웹훅 엔드포인트 상태 확인
            const result = getWebhookStatus()
            return createSuccessResponse(result)
        }

        if (method === 'POST' && path === '/github-webhook/webhooks/github') {
            // POST /webhooks/github - GitHub 웹훅 이벤트 처리
            const eventType = req.headers.get('x-github-event')
            const deliveryId = req.headers.get('x-github-delivery')
            const signature = req.headers.get('x-hub-signature-256')

            console.log('Received webhook:', {
                eventType,
                deliveryId,
                hasSignature: !!signature,
            })

            // raw body 읽기
            const rawBody = await req.text()

            // 서명 검증
            if (signature && !(await verifyGithubSignature(rawBody, signature))) {
                console.log('Signature verification failed')
                return createErrorResponse('Invalid signature', 401)
            }

            // JSON 파싱
            let payload
            try {
                payload = JSON.parse(rawBody)
            } catch (error) {
                console.error('Failed to parse JSON payload:', error)
                return createErrorResponse('Invalid JSON payload', 400)
            }

            // 이벤트 타입별 처리
            await handleWebhookEvent(payload, eventType)

            return createSuccessResponse({
                ok: true,
                message: 'Webhook processed successfully'
            })
        }

        return createErrorResponse('Not Found', 404)

    } catch (error) {
        console.error('Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
        return createErrorResponse(errorMessage, 500)
    }
})
