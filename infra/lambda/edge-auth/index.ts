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
  const state = qs.get('state');
  const verifier = cookies['pkce_verifier'];

  if (!code || !verifier) {
    return {
      status: '400',
      statusDescription: 'Bad Request',
      body: 'Missing authorization code or PKCE verifier',
    };
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier, redirectUri, config);
    const originalPath = state
      ? Buffer.from(state, 'base64url').toString()
      : '/';

    const tokenCookies = buildTokenCookies(
      tokens.id_token,
      tokens.access_token,
      tokens.refresh_token
    );

    const clearVerifier = {
      key: 'Set-Cookie',
      value: serializeCookie('pkce_verifier', { value: '', path: '/auth', maxAge: 0 }),
    };

    return {
      status: '302',
      statusDescription: 'Found',
      headers: {
        location: [{ key: 'Location', value: originalPath }],
        'set-cookie': [...tokenCookies, clearVerifier],
        'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    };
  } catch (err) {
    console.error('Token exchange failed:', err);
    return {
      status: '502',
      statusDescription: 'Bad Gateway',
      body: 'Authentication failed',
    };
  }
}
