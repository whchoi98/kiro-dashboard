import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createHash, randomBytes } from 'crypto';
import { EdgeAuthConfig, TokenSet } from './types';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier(config: EdgeAuthConfig) {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      clientId: config.clientId,
      tokenUse: 'id',
    });
  }
  return verifier;
}

export async function validateIdToken(
  token: string,
  config: EdgeAuthConfig
): Promise<{ email?: string; name?: string } | null> {
  try {
    const payload = await getVerifier(config).verify(token);
    return {
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    };
  } catch {
    return null;
  }
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9\-._~]/g, '')
    .slice(0, 128);

  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  config: EdgeAuthConfig,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://${config.cognitoDomain}/oauth2/authorize?${params}`;
}

export function buildLogoutUrl(
  config: EdgeAuthConfig,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: redirectUri,
  });
  return `https://${config.cognitoDomain}/logout?${params}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  config: EdgeAuthConfig
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }).toString();

  return tokenRequest(config.cognitoDomain, body);
}

export async function refreshTokens(
  refreshToken: string,
  config: EdgeAuthConfig
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  }).toString();

  return tokenRequest(config.cognitoDomain, body);
}

function tokenRequest(domain: string, body: string): Promise<TokenSet> {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: domain,
        path: '/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Token request failed: ${res.statusCode} ${data}`));
            return;
          }
          resolve(JSON.parse(data));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
