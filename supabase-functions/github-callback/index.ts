/// <reference types="deno.ns" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:3000'

// 모든 요청에 적용할 CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// GitHub 설치 콜백 처리
async function handleGithubCallback(
  installationId: string,
  state: string,
) {
  const callbackPath = '/projects'; // 리다이렉트 최종 위치

  if (!state) {
    return { url: `${FRONTEND_URL}${callbackPath}?status=error&reason=missing_state`, statusCode: 302 };
  }

  let userId;
  try {
    const decodedState = JSON.parse(atob(state));
    userId = decodedState.userId;
  } catch {
    return { url: `${FRONTEND_URL}${callbackPath}?status=error&reason=invalid_state`, statusCode: 302 };
  }

  if (!installationId) {
    return { url: `${FRONTEND_URL}${callbackPath}?status=error&reason=missing_installation_id`, statusCode: 302 };
  }

  // 먼저 기존 설치가 있는지 확인
  const { data: existingInstallation } = await supabase
    .from('github_installations')
    .select('*')
    .eq('github_installation_id', installationId)
    .single();

  let installation;
  let error;

  if (existingInstallation) {
    // 기존 설치가 있으면 업데이트
    const { data, error: updateError } = await supabase
      .from('github_installations')
      .update({
        user_id: userId,
        account_id: 'unknown',
        account_login: 'unknown',
        account_type: 'Organization',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('github_installation_id', installationId)
      .select()
      .single();

    installation = data;
    error = updateError;
  } else {
    // 새 설치 생성
    const { data, error: insertError } = await supabase
      .from('github_installations')
      .insert({
        installation_id: installationId,
        user_id: userId,
        github_installation_id: installationId,
        account_id: 'unknown',
        account_login: 'unknown',
        account_type: 'Organization',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    installation = data;
    error = insertError;
  }

  if (error) {
    console.error('Database error:', error);
    return { url: `${FRONTEND_URL}${callbackPath}?status=error&reason=installation_failed`, statusCode: 302 };
  }

  return {
    url: `${FRONTEND_URL}${callbackPath}?status=success&installation_id=${encodeURIComponent(
      installationId,
    )}&account_login=${encodeURIComponent(installation?.account_login || '')}`,
    statusCode: 302,
  };
}

serve(async (req) => {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GitHub 콜백 처리
  if (method === 'GET' && path === '/github-callback') {
    const installationId = url.searchParams.get('installation_id') || '';
    const state = url.searchParams.get('state') || '';

    const result = await handleGithubCallback(installationId, state);

    return new Response(null, {
      status: result.statusCode,
      headers: {
        Location: result.url,
        ...corsHeaders,
      },
    });
  }

  // 기타 요청 404
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
