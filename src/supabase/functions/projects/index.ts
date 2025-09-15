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
      is_active,
      is_private,
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
async function createProjectWithGithub(userId: string, body: any) {
    const {
        name,
        description,
        installationId,
        githubRepoId,
        githubRepoUrl,
        githubRepoName,
        githubOwner,
        isPrivate,
        selectedBranch
    } = body

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
            is_private: isPrivate,
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
      is_active,
      is_private,
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
        project: {
            projectId: data.project_id,
            name: data.name,
            description: data.description,
            isActive: data.is_active,
            githubRepoId: data.github_repo_id,
            selectedBranch: data.selected_branch,
            githubRepoUrl: data.github_repo_url,
            githubRepoName: data.github_repo_name,
            githubOwner: data.github_owner,
            isPrivate: data.is_private,
            createdAt: data.created_at,
        },
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
      is_active,
      is_private,
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
      is_active,
      is_private,
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
        isPrivate,
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
            is_private: isPrivate,
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
      is_active,
      is_private,
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

// 선택된 브랜치 변경
async function updateSelectedBranch(userId: string, projectId: string, body: any) {
    const { branchName } = body

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
      is_active,
      is_private,
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
        if (method === 'POST' && path === '/projects') {
            // POST /projects - 프로젝트 생성
            const body = await req.json()
            const result = await createProject(userId, body)
            return createSuccessResponse(result)
        }

        if (method === 'POST' && path === '/projects/with-github') {
            // POST /projects/with-github - GitHub 연동 프로젝트 생성
            const body = await req.json()
            const result = await createProjectWithGithub(userId, body)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path === '/projects') {
            // GET /projects - 사용자 프로젝트 목록
            const result = await getUserProjects(userId)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.startsWith('/projects/') && !path.includes('/repositories')) {
            // GET /projects/:id - 프로젝트 상세 정보
            const projectId = path.split('/')[2]
            const result = await getProjectDetail(userId, projectId)
            return createSuccessResponse(result)
        }

        if (method === 'POST' && path.includes('/repositories') && !path.includes('/branches')) {
            // POST /projects/:id/repositories - 저장소 연결
            const pathParts = path.split('/')
            const projectId = pathParts[2]
            const body = await req.json()
            const result = await connectRepository(userId, projectId, body)
            return createSuccessResponse(result)
        }

        if (method === 'GET' && path.includes('/repositories/') && path.includes('/branches')) {
            // GET /projects/:id/repositories/:repoId/branches - 프로젝트의 브랜치 목록
            const pathParts = path.split('/')
            const projectId = pathParts[2]
            const result = await getRepositoryBranches(userId, projectId)
            return createSuccessResponse(result)
        }

        if (method === 'PATCH' && path.includes('/repositories/') && path.includes('/branch')) {
            // PATCH /projects/:id/repositories/:repoId/branch - 선택된 브랜치 변경
            const pathParts = path.split('/')
            const projectId = pathParts[2]
            const body = await req.json()
            const result = await updateSelectedBranch(userId, projectId, body)
            return createSuccessResponse(result)
        }

        return createErrorResponse('Not Found', 404)

    } catch (error) {
        console.error('Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
        return createErrorResponse(errorMessage, 500)
    }
})
