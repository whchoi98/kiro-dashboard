import { CloudFrontRequestEvent, CloudFrontRequestResult } from 'aws-lambda';
import { getConfig } from './config';
import { parseCookies, buildTokenCookies, buildClearCookies, serializeCookie } from './cookies';
import {
  validateIdToken,
  generatePkce,
  buildAuthorizeUrl,
  buildLogoutUrl,
  exchangeCodeForTokens,
  refreshTokens,
} from './auth';
import { EdgeAuthConfig } from './types';

export async function handler(
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequestResult> {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const uri = request.uri;
  const host = headers.host[0].value;
  const baseUrl = `https://${host}`;

  if (uri === '/api/health') {
    return request;
  }

  const config = await getConfig();
  const cookies = parseCookies(headers);
  const redirectUri = `${baseUrl}/auth/callback`;

  if (uri === '/auth/callback') {
    return handleCallback(request, cookies, redirectUri, config);
  }

  if (uri === '/auth/logout') {
    const logoutUrl = buildLogoutUrl(config, baseUrl);
    return {
      status: '302',
      statusDescription: 'Found',
      headers: {
        location: [{ key: 'Location', value: logoutUrl }],
        'set-cookie': buildClearCookies(),
        'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    };
  }

  return handleAuth(request, cookies, redirectUri, config, uri);
}

async function handleAuth(
  request: any,
  cookies: Record<string, string>,
  redirectUri: string,
  config: EdgeAuthConfig,
  uri: string
): Promise<CloudFrontRequestResult> {
  const idToken = cookies['id_token'];

  if (idToken) {
    const claims = await validateIdToken(idToken, config);
    if (claims) {
      request.headers['x-user-email'] = [
        { key: 'X-User-Email', value: claims.email || '' },
      ];
      request.headers['x-user-name'] = [
        { key: 'X-User-Name', value: claims.name || '' },
      ];
      return request;
    }

    const refreshToken = cookies['refresh_token'];
    if (refreshToken) {
      try {
        const tokens = await refreshTokens(refreshToken, config);
        const newClaims = await validateIdToken(tokens.id_token, config);
        if (newClaims) {
          request.headers['x-user-email'] = [
            { key: 'X-User-Email', value: newClaims.email || '' },
          ];
          request.headers['x-user-name'] = [
            { key: 'X-User-Name', value: newClaims.name || '' },
          ];
          return request;
        }
      } catch {
        // refresh failed — fall through to redirect
      }
    }
  }

  const pkce = generatePkce();
  const state = Buffer.from(uri).toString('base64url');
  const authorizeUrl = buildAuthorizeUrl(config, redirectUri, state, pkce.challenge);

  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: authorizeUrl }],
      'set-cookie': [
        {
          key: 'Set-Cookie',
          value: serializeCookie('pkce_verifier', {
            value: pkce.verifier,
            path: '/auth',
            maxAge: 300,
          }),
        },
      ],
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
    },
  };
}

async function handleCallback(
  request: any,
  cookies: Record<string, string>,
  redirectUri: string,
  config: EdgeAuthConfig
): Promise<CloudFrontRequestResult> {
  const qs = new URLSearchParams(request.querystring);
  const code = qs.get('code');
  const verifier = cookies['pkce_verifier'];

  // Return path is carried in `state` (base64url of the original URI). Only
  // accept an in-app absolute path — never an absolute URL — to avoid an
  // open redirect; default to root.
  let originalPath = '/';
  const state = qs.get('state');
  if (state) {
    try {
      const decoded = Buffer.from(state, 'base64url').toString();
      // Same-origin path only — this value goes into a Location header, so it
      // must never carry a scheme or host. Reject backslashes and control
      // chars first (browsers fold "\" into "/", so "/\evil.com" would become
      // a protocol-relative redirect), then resolve against a throwaway origin
      // and accept ONLY when it stays same-origin; emit just the path.
      if (!/[\\\x00-\x1f]/.test(decoded)) {
        const u = new URL(decoded, 'https://placeholder.invalid');
        if (
          u.origin === 'https://placeholder.invalid' &&
          u.pathname.startsWith('/') &&
          !u.pathname.startsWith('//')
        ) {
          originalPath = u.pathname + u.search + u.hash;
        }
      }
    } catch {
      // malformed state — keep default
    }
  }

  const clearVerifier = {
    key: 'Set-Cookie',
    value: serializeCookie('pkce_verifier', { value: '', path: '/auth', maxAge: 0 }),
  };

  if (code && verifier) {
    try {
      const tokens = await exchangeCodeForTokens(code, verifier, redirectUri, config);
      const tokenCookies = buildTokenCookies(
        tokens.id_token,
        tokens.access_token,
        tokens.refresh_token
      );
      return {
        status: '302',
        statusDescription: 'Found',
        headers: {
          location: [{ key: 'Location', value: originalPath }],
          // clear pkce_verifier and the retry guard on success
          'set-cookie': [
            ...tokenCookies,
            clearVerifier,
            { key: 'Set-Cookie', value: serializeCookie('auth_retry', { value: '', path: '/', maxAge: 0 }) },
          ],
          'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
        },
      };
    } catch (err) {
      console.error('Token exchange failed:', err);
      // fall through to the self-heal path below
    }
  }

  // Missing code/verifier OR the token exchange was rejected (Cognito returns
  // invalid_grant / invalid_request when the code<->PKCE verifier pair does
  // not line up — typically a stale/reused code or a verifier cookie clobbered
  // by a concurrent request). A fresh authorize round-trip almost always
  // succeeds via the active Cognito session (this is what a manual reload
  // did), so restart the flow automatically ONCE instead of dead-ending on an
  // error page. `auth_retry` guards against an infinite redirect loop.
  if (!cookies['auth_retry']) {
    return {
      status: '302',
      statusDescription: 'Found',
      headers: {
        location: [{ key: 'Location', value: originalPath }],
        'set-cookie': [
          { key: 'Set-Cookie', value: serializeCookie('auth_retry', { value: '1', path: '/', maxAge: 120 }) },
          clearVerifier,
        ],
        'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    };
  }

  // Second consecutive failure — show a friendly page and clear the guard so
  // the next fresh attempt can self-heal again.
  return {
    status: '401',
    statusDescription: 'Unauthorized',
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }],
      'set-cookie': [
        { key: 'Set-Cookie', value: serializeCookie('auth_retry', { value: '', path: '/', maxAge: 0 }) },
        clearVerifier,
      ],
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
    },
    body:
      '<!doctype html><meta charset="utf-8"><title>로그인 재시도</title>' +
      '<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0a0910;color:#f5f3fa;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center">' +
      '<div><h2 style="font-weight:800">로그인에 실패했습니다</h2>' +
      '<p style="color:#a49db8">인증 세션이 만료되었거나 일시적인 오류입니다. 잠시 후 다시 시도해 주세요.</p>' +
      '<p style="margin-top:20px"><a href="/" style="display:inline-block;background:#9046FF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:700">다시 로그인</a></p></div></body>',
  };
}
