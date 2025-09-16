/// <reference types="deno.ns" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:3000';

// CORS 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
};

// 익명 접근을 위한 헤더
const anonymousHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// GitHub 설치 콜백 처리
async function handleGithubCallback(
  installationId: string,
  setupAction: string,
  state: string,
) {
  const callbackPath = '/integrations/github/callback';

  try {
    console.log('[GitHub Callback] Processing:', {
      installationId,
      setupAction,
      state: state ? `${state.substring(0, 20)}...` : 'null',
    });

    // 1) state 검증 및 사용자 식별
    if (!state) {
      console.log('[GitHub Callback] Error: Missing state parameter');
      return {
        url: `${FRONTEND_URL}${callbackPath}?status=error&reason=missing_state`,
        statusCode: 302,
      };
    }

    let userId;
    try {
      const decodedState = JSON.parse(atob(state));
      userId = decodedState.userId;
    } catch {
      console.log('[GitHub Callback] Error: Invalid state token');
      return {
        url: `${FRONTEND_URL}${callbackPath}?status=error&reason=invalid_state`,
        statusCode: 302,
      };
    }

    console.log('[GitHub Callback] State verified for user:', userId);

    // 2) installation_id 유효성 확인
    if (!installationId) {
      console.log('[GitHub Callback] Error: Missing installation_id');
      return {
        url: `${FRONTEND_URL}${callbackPath}?status=error&reason=missing_installation_id`,
        statusCode: 302,
      };
    }

    // 3) GitHub Installation 등록
    const { data: installation, error: installError } = await supabase
      .from('github_installations')
      .insert({
        installation_id: installationId,
        user_id: userId,
        github_installation_id: installationId,
        account_id: 'unknown',
        account_login: 'unknown',
        account_type: 'Organization',
        is_active: true,
      })
      .select()
      .single();

    if (installError) {
      console.error(
        '[GitHub Callback] Installation registration failed:',
        installError,
      );
      return {
        url: `${FRONTEND_URL}${callbackPath}?status=error&reason=installation_failed`,
        statusCode: 302,
      };
    }

    console.log(
      '[GitHub Callback] Installation registered successfully:',
      installation,
    );

    // 4) 성공 리다이렉트
    const successUrl = `${FRONTEND_URL}${callbackPath}?status=success&installation_id=${encodeURIComponent(
      installationId,
    )}&account_login=${encodeURIComponent(installation.account_login || '')}`;

    console.log('[GitHub Callback] Redirecting to:', successUrl);

    return {
      url: successUrl,
      statusCode: 302,
    };
  } catch (error) {
    console.error('[GitHub Callback] Error:', error);

    let reason = 'installation_failed';
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('유효하지 않은')) {
      reason = 'invalid_installation';
    } else if (errorMessage.includes('권한')) {
      reason = 'permission_denied';
    }

    return {
      url: `${FRONTEND_URL}${callbackPath}?status=error&reason=${reason}`,
      statusCode: 302,
    };
  }
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;

    console.log('[GitHub Callback] Request received:', {
      method,
      path,
      fullUrl: req.url,
    });

    // CORS preflight 처리
    if (method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, 
        headers: {
          ...anonymousHeaders,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    // GitHub 콜백 처리 (인증 없이 접근 허용)
    if (method === 'GET' && path === '/github-callback') {
      const installationId = url.searchParams.get('installation_id') || '';
      const setupAction = url.searchParams.get('setup_action') || '';
      const state = url.searchParams.get('state') || '';

      const result = await handleGithubCallback(
        installationId,
        setupAction,
        state,
      );

      return new Response(null, {
        status: result.statusCode,
        headers: {
          Location: result.url,
          ...anonymousHeaders,
        },
      });
    }

    // 다른 경로는 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[GitHub Callback] Function error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Internal Server Error';

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
});
