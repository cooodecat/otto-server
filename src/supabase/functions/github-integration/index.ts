import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Octokit } from "https://esm.sh/@octokit/rest@19.0.0"
import { createAppAuth } from "https://esm.sh/@octokit/auth-app@4.0.0"

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
)

// GitHub App 설정
const GITHUB_APP_ID = Deno.env.get('OTTO_GITHUB_APP_ID') ?? ''
const GITHUB_APP_PRIVATE_KEY = Deno.env.get('OTTO_GITHUB_APP_PRIVATE_KEY') ?? ''
const GITHUB_APP_NAME = Deno.env.get('OTTO_GITHUB_APP_NAME') ?? 'otto-test-1'
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:3000'

// JWT 토큰에서 사용자 정보 추출
async function getUserFromToken(authHeader: string) {
    try {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error) {
            console.error('Supabase auth error:', error)
            throw new Error(`인증 오류: ${error.message}`)
        }

        if (!user) {
            console.error('No user found in token')
            throw new Error('유효하지 않은 토큰입니다')
        }

        return user
    } catch (error) {
        console.error('getUserFromToken error:', error)
        throw error
    }
}

// 에러 응답 생성
function createErrorResponse(message: string, status: number = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

// 성공 응답 생성
function createSuccessResponse(data: any, status: number = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

// GitHub Installation 등록
async function registerGithubInstallation(userId: string, body: any) {
    const { installationId } = body

    // GitHub API로 설치 정보 검증
    const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: installationId,
        },
    })

    let installationInfo
    try {
        const { data } = await octokit.rest.apps.getInstallation({
            installation_id: parseInt(installationId),
        })
        installationInfo = data
    } catch (error) {
        throw new Error('유효하지 않은 GitHub 설치 ID입니다')
    }

    // 데이터베이스에 upsert
    const { data, error } = await supabase
        .from('github_installations')
        .upsert({
            user_id: userId,
            github_installation_id: installationId,
            account_login: installationInfo.account.login,
            account_id: installationInfo.account.id.toString(),
            account_type: installationInfo.account.type,
        }, {
            onConflict: 'github_installation_id'
        })
        .select(`
      installation_id,
      user_id,
      github_installation_id,
      account_login,
      account_id,
      account_type,
      is_active,
      created_at,
      updated_at
    `)
        .single()

    if (error) {
        throw new Error(error.message)
    }

    return {
        installationId: data.installation_id,
        userId: data.user_id,
        githubInstallationId: data.github_installation_id,
        accountLogin: data.account_login,
        accountId: data.account_id,
        accountType: data.account_type,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        user: {
            userId: data.user_id,
            email: '',
            name: '',
        },
    }
}

// GitHub 설치 목록 조회
async function getUserGithubInstallations(userId: string) {
    const { data, error } = await supabase
        .from('github_installations')
        .select(`
      installation_id,
      user_id,
      github_installation_id,
      account_login,
      account_id,
      account_type,
      is_active,
      created_at,
      updated_at
    `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) {
        throw new Error(error.message)
    }

    return data.map(installation => ({
        installationId: installation.installation_id,
        userId: installation.user_id,
        githubInstallationId: installation.github_installation_id,
        accountLogin: installation.account_login,
        accountId: installation.account_id,
        accountType: installation.account_type,
        isActive: installation.is_active,
        createdAt: installation.created_at,
        updatedAt: installation.updated_at,
    }))
}

// 접근 가능한 저장소 목록 조회
async function getAccessibleRepositories(userId: string, installationId: string) {
    // 사용자 권한 확인
    const { data: installation, error: installError } = await supabase
        .from('github_installations')
        .select('*')
        .eq('github_installation_id', installationId)
        .eq('user_id', userId)
        .single()

    if (installError || !installation) {
        throw new Error('해당 GitHub 설치에 접근할 권한이 없습니다')
    }

    // GitHub API로 저장소 목록 조회
    const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: installationId,
        },
    })

    const { data: repos } = await octokit.rest.apps.listReposAccessibleToInstallation()

    return repos.repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        defaultBranch: repo.default_branch,
    }))
}

// 브랜치 목록 조회
async function getRepositoryBranches(userId: string, installationId: string, repoFullName: string) {
    // 사용자 권한 확인
    const { data: installation, error: installError } = await supabase
        .from('github_installations')
        .select('*')
        .eq('github_installation_id', installationId)
        .eq('user_id', userId)
        .single()

    if (installError || !installation) {
        throw new Error('해당 GitHub 설치에 접근할 권한이 없습니다')
    }

    // GitHub API로 브랜치 목록 조회
    const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: installationId,
        },
    })

    const [owner, repo] = repoFullName.split('/')
    const { data: branches } = await octokit.rest.repos.listBranches({
        owner,
        repo,
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

// GitHub App 설치 URL 생성
function getGithubInstallUrl(userId: string) {
    // 간단한 state 생성 (실제로는 JWT를 사용해야 함)
    const state = btoa(JSON.stringify({ userId, timestamp: Date.now() }))
    const baseUrl = 'https://github.com/apps'
    const installUrl = `${baseUrl}/${GITHUB_APP_NAME}/installations/new?state=${encodeURIComponent(state)}`

    return {
        userId,
        appSlug: GITHUB_APP_NAME,
        state,
        installUrl,
    }
}

// GitHub 설치 상태 확인
async function getGithubStatus(userId: string) {
    const { data: installations, error } = await supabase
        .from('github_installations')
        .select(`
      installation_id,
      github_installation_id,
      account_login,
      account_id,
      account_type,
      created_at
    `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) {
        throw new Error(error.message)
    }

    // 각 설치에 연결된 프로젝트 개수 조회
    const installationsWithCount = await Promise.all(
        installations.map(async (installation) => {
            const { count } = await supabase
                .from('projects')
                .select('*', { count: 'exact', head: true })
                .eq('installation_id', installation.installation_id)

            return {
                installationId: installation.installation_id,
                githubInstallationId: installation.github_installation_id,
                accountLogin: installation.account_login,
                accountId: installation.account_id,
                accountType: installation.account_type,
                connectedProjects: count || 0,
                installedAt: installation.created_at,
            }
        })
    )

    const totalProjects = installationsWithCount.reduce(
        (sum, installation) => sum + installation.connectedProjects,
        0
    )

    return {
        hasInstallation: installations.length > 0,
        totalInstallations: installations.length,
        totalConnectedProjects: totalProjects,
        installations: installationsWithCount,
    }
}

// GitHub 설치 콜백 처리
async function handleGithubCallback(installationId: string, setupAction: string, state: string) {
    const callbackPath = '/integrations/github/callback'

    try {
        // state 검증 및 사용자 식별
        if (!state) {
            return {
                url: `${FRONTEND_URL}${callbackPath}?status=error&reason=missing_state`,
                statusCode: 302,
            }
        }

        let userId
        try {
            const decodedState = JSON.parse(atob(state))
            userId = decodedState.userId
        } catch {
            return {
                url: `${FRONTEND_URL}${callbackPath}?status=error&reason=invalid_state`,
                statusCode: 302,
            }
        }

        if (!userId) {
            return {
                url: `${FRONTEND_URL}${callbackPath}?status=error&reason=invalid_state`,
                statusCode: 302,
            }
        }

        // installation_id 유효성 확인
        if (!installationId) {
            return {
                url: `${FRONTEND_URL}${callbackPath}?status=error&reason=missing_installation_id`,
                statusCode: 302,
            }
        }

        // 사용자와 설치 연결
        const installation = await registerGithubInstallation(userId, { installationId })

        const successUrl = `${FRONTEND_URL}${callbackPath}?status=success&installation_id=${encodeURIComponent(
            installationId
        )}&account_login=${encodeURIComponent(installation.accountLogin)}`

        return {
            url: successUrl,
            statusCode: 302,
        }
    } catch (error) {
        console.error('GitHub Callback Error:', error)

        let reason = 'installation_failed'
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        if (errorMessage.includes('유효하지 않은')) {
            reason = 'invalid_installation'
        } else if (errorMessage.includes('권한')) {
            reason = 'permission_denied'
        }

        return {
            url: `${FRONTEND_URL}${callbackPath}?status=error&reason=${reason}`,
            statusCode: 302,
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

        // 인증이 필요한 엔드포인트 확인
        const authRequiredPaths = [
            '/github-integration/projects/github-installations',
            '/github-integration/projects/github/install-url',
            '/github-integration/projects/github/status'
        ]

        const needsAuth = authRequiredPaths.some(authPath => path.startsWith(authPath))

        let userId = null
        if (needsAuth) {
            const authHeader = req.headers.get('authorization')
            if (!authHeader) {
                console.log('No authorization header provided')
                return createErrorResponse('로그인이 필요합니다', 401)
            }

            try {
                const user = await getUserFromToken(authHeader)
                userId = user.id
                console.log('User authenticated successfully:', userId)
            } catch (error) {
                console.error('Authentication failed:', error)
                const errorMessage = error instanceof Error ? error.message : '인증에 실패했습니다'
                return createErrorResponse(errorMessage, 401)
            }
        }

        // 라우팅 처리
        console.log('Processing route:', { method, path, needsAuth, userId })

        if (method === 'POST' && path === '/github-integration/projects/github-installations') {
            // POST /projects/github-installations - GitHub 설치 등록
            const body = await req.json()
            const result = await registerGithubInstallation(userId, body)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path === '/github-integration/projects/github-installations') {
            // GET /projects/github-installations - GitHub 설치 목록 조회
            const result = await getUserGithubInstallations(userId)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.includes('/github-installations/') && path.includes('/repositories') && !path.includes('/branches')) {
            // GET /projects/github-installations/:id/repositories - 접근 가능한 저장소 목록
            const pathParts = path.split('/')
            const installationId = pathParts[pathParts.length - 2] // 마지막에서 두 번째가 installationId
            const result = await getAccessibleRepositories(userId, installationId)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.includes('/github-installations/') && path.includes('/repositories/') && path.includes('/branches')) {
            // GET /projects/github-installations/:id/repositories/:repo/branches - 브랜치 목록 조회
            const pathParts = path.split('/')
            const installationId = pathParts[pathParts.length - 3] // 마지막에서 세 번째가 installationId
            const repoFullName = pathParts[pathParts.length - 1] // 마지막이 repoFullName
            const decodedRepoFullName = decodeURIComponent(repoFullName)
            const result = await getRepositoryBranches(userId, installationId, decodedRepoFullName)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path === '/github-integration/projects/github/install-url') {
            // GET /projects/github/install-url - GitHub App 설치 URL 생성
            const result = getGithubInstallUrl(userId)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path === '/github-integration/projects/github/status') {
            // GET /projects/github/status - GitHub 설치 상태 확인
            const result = await getGithubStatus(userId)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path === '/github-integration/projects/github/callback') {
            // GET /projects/github/callback - GitHub 설치 콜백 처리
            const installationId = url.searchParams.get('installation_id') || ''
            const setupAction = url.searchParams.get('setup_action') || ''
            const state = url.searchParams.get('state') || ''

            const result = await handleGithubCallback(installationId, setupAction, state)

            return new Response(null, {
                status: result.statusCode,
                headers: {
                    'Location': result.url,
                    ...corsHeaders
                }
            })
        }

        console.log('No matching route found:', { method, path })
        return createErrorResponse('Not Found', 404)

    } catch (error) {
        console.error('Function error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
        console.error('Returning error response:', { errorMessage, status: 500 })
        return createErrorResponse(errorMessage, 500)
    }
})
