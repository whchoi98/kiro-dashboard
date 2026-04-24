# Lambda@Edge + Cognito Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth.js app-level auth with CloudFront Lambda@Edge Cognito authentication so unauthenticated requests are blocked at the CDN edge.

**Architecture:** Lambda@Edge (Viewer Request) validates Cognito JWTs from cookies. Unauthenticated users are redirected to Cognito Hosted UI via PKCE flow. Tokens are stored in HttpOnly cookies. Config is loaded from SSM Parameter Store (us-east-1) on Lambda cold start. The existing X-Custom-Secret ALB defense remains.

**Tech Stack:** AWS CDK (TypeScript), Lambda@Edge, Cognito, SSM Parameter Store, `aws-jwt-verify`, CloudFront `experimental.EdgeFunction`

**Spec:** `docs/superpowers/specs/2026-04-24-lambda-edge-cognito-auth-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `infra/lambda/edge-auth/index.ts` | Lambda@Edge handler — routes requests to auth logic |
| `infra/lambda/edge-auth/auth.ts` | JWT validation, PKCE generation, token exchange, token refresh |
| `infra/lambda/edge-auth/config.ts` | SSM config loader with module-level cache |
| `infra/lambda/edge-auth/cookies.ts` | Cookie parsing and serialization for CloudFront events |
| `infra/lambda/edge-auth/types.ts` | TypeScript interfaces for config, CloudFront events |
| `infra/lambda/edge-auth/package.json` | Dependencies for the Lambda bundle (`aws-jwt-verify`) |
| `infra/lambda/edge-auth/tsconfig.json` | TypeScript config for Lambda code |

### Modified Files

| File | Change |
|------|--------|
| `infra/lib/security-stack.ts` | Add `EdgeAuthClient` (public, PKCE), export `edgeClientId` |
| `infra/lib/cdn-stack.ts` | Add EdgeFunction, SSM AwsCustomResource, callback-URL AwsCustomResource, edgeLambdas on distribution |
| `infra/bin/app.ts` | Pass `userPool`, `edgeClientId`, `userPoolDomain` to CdnStack |
| `infra/package.json` | No changes needed (EdgeFunction bundling uses esbuild built into CDK) |

### Removed Files

| File | Reason |
|------|--------|
| `lib/auth.ts` | NextAuth config — replaced by Lambda@Edge |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth handler — no longer needed |
| `app/login/page.tsx` | Custom login page — Cognito Hosted UI replaces it |

### Modified App Files

| File | Change |
|------|--------|
| `package.json` | Remove `next-auth` dependency |

---

## Task 1: Lambda@Edge — Types and Config Loader

**Files:**
- Create: `infra/lambda/edge-auth/types.ts`
- Create: `infra/lambda/edge-auth/config.ts`
- Create: `infra/lambda/edge-auth/package.json`
- Create: `infra/lambda/edge-auth/tsconfig.json`

- [ ] **Step 1: Create package.json for the Lambda function**

```json
{
  "name": "edge-auth",
  "private": true,
  "dependencies": {
    "aws-jwt-verify": "^4.0.1"
  }
}
```

Write to `infra/lambda/edge-auth/package.json`.

- [ ] **Step 2: Create tsconfig.json for the Lambda function**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["es2020"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true
  },
  "include": ["*.ts"]
}
```

Write to `infra/lambda/edge-auth/tsconfig.json`.

- [ ] **Step 3: Create types.ts**

```typescript
export interface EdgeAuthConfig {
  userPoolId: string;
  clientId: string;
  cognitoDomain: string;
  cognitoRegion: string;
}

export interface TokenSet {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface CookieMap {
  [name: string]: string;
}
```

Write to `infra/lambda/edge-auth/types.ts`.

- [ ] **Step 4: Create config.ts**

This module loads configuration from SSM Parameter Store on cold start and caches it in a module-level variable. It uses `@aws-sdk/client-ssm` which is included in the Node.js 20.x Lambda runtime (NOT bundled).

```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { EdgeAuthConfig } from './types';

const SSM_PARAM_NAME = '/kiro-dashboard/edge-auth/config';
const ssm = new SSMClient({ region: 'us-east-1' });

let cachedConfig: EdgeAuthConfig | null = null;

export async function getConfig(): Promise<EdgeAuthConfig> {
  if (cachedConfig) return cachedConfig;

  const result = await ssm.send(
    new GetParameterCommand({ Name: SSM_PARAM_NAME })
  );

  if (!result.Parameter?.Value) {
    throw new Error(`SSM parameter ${SSM_PARAM_NAME} not found or empty`);
  }

  cachedConfig = JSON.parse(result.Parameter.Value) as EdgeAuthConfig;
  return cachedConfig;
}
```

Write to `infra/lambda/edge-auth/config.ts`.

- [ ] **Step 5: Install dependencies**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra/lambda/edge-auth && npm install`
Expected: `node_modules/` created with `aws-jwt-verify`.

- [ ] **Step 6: Commit**

```bash
git add infra/lambda/edge-auth/package.json infra/lambda/edge-auth/package-lock.json infra/lambda/edge-auth/tsconfig.json infra/lambda/edge-auth/types.ts infra/lambda/edge-auth/config.ts
git commit -m "feat(edge-auth): add types and SSM config loader for Lambda@Edge"
```

---

## Task 2: Lambda@Edge — Cookie Utilities

**Files:**
- Create: `infra/lambda/edge-auth/cookies.ts`

- [ ] **Step 1: Create cookies.ts**

CloudFront events represent cookies differently from standard HTTP. This module parses cookies from CloudFront `headers` format and serializes `Set-Cookie` headers for CloudFront responses.

```typescript
import { CookieMap } from './types';

export function parseCookies(headers: Record<string, Array<{ value: string }>>): CookieMap {
  const cookies: CookieMap = {};
  const cookieHeaders = headers['cookie'] || [];

  for (const header of cookieHeaders) {
    const pairs = header.value.split(';');
    for (const pair of pairs) {
      const [name, ...rest] = pair.trim().split('=');
      if (name) {
        cookies[name.trim()] = rest.join('=').trim();
      }
    }
  }

  return cookies;
}

interface SetCookieOptions {
  value: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export function serializeCookie(name: string, opts: SetCookieOptions): string {
  let cookie = `${name}=${opts.value}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.httpOnly !== false) cookie += '; HttpOnly';
  if (opts.secure !== false) cookie += '; Secure';
  cookie += `; SameSite=${opts.sameSite || 'Lax'}`;
  return cookie;
}

export function buildTokenCookies(
  idToken: string,
  accessToken: string,
  refreshToken?: string
): Array<{ key: string; value: string }> {
  const maxAge = 3600;
  const cookies: Array<{ key: string; value: string }> = [
    {
      key: 'Set-Cookie',
      value: serializeCookie('id_token', { value: idToken, path: '/', maxAge }),
    },
    {
      key: 'Set-Cookie',
      value: serializeCookie('access_token', { value: accessToken, path: '/', maxAge }),
    },
  ];

  if (refreshToken) {
    cookies.push({
      key: 'Set-Cookie',
      value: serializeCookie('refresh_token', {
        value: refreshToken,
        path: '/',
        maxAge: 30 * 24 * 3600,
      }),
    });
  }

  return cookies;
}

export function buildClearCookies(): Array<{ key: string; value: string }> {
  return ['id_token', 'access_token', 'refresh_token', 'pkce_verifier'].map(
    (name) => ({
      key: 'Set-Cookie',
      value: serializeCookie(name, { value: '', path: '/', maxAge: 0 }),
    })
  );
}
```

Write to `infra/lambda/edge-auth/cookies.ts`.

- [ ] **Step 2: Commit**

```bash
git add infra/lambda/edge-auth/cookies.ts
git commit -m "feat(edge-auth): add cookie parsing and serialization utilities"
```

---

## Task 3: Lambda@Edge — Auth Logic (JWT, PKCE, Token Exchange)

**Files:**
- Create: `infra/lambda/edge-auth/auth.ts`

- [ ] **Step 1: Create auth.ts**

This is the core auth module. It handles:
1. JWT validation via `aws-jwt-verify` (caches JWKS automatically)
2. PKCE code_verifier/code_challenge generation
3. Token exchange (authorization code → tokens)
4. Token refresh (refresh_token → new tokens)
5. Building Cognito authorize/logout redirect URLs

```typescript
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createHash, randomBytes } from 'crypto';
import { https } from 'follow-redirects';
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
  return new Promise((resolve, reject) => {
    const req = require('https').request(
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
```

Write to `infra/lambda/edge-auth/auth.ts`.

- [ ] **Step 2: Commit**

```bash
git add infra/lambda/edge-auth/auth.ts
git commit -m "feat(edge-auth): add JWT validation, PKCE, and token exchange logic"
```

---

## Task 4: Lambda@Edge — Handler (Request Router)

**Files:**
- Create: `infra/lambda/edge-auth/index.ts`

- [ ] **Step 1: Create index.ts**

This is the Lambda@Edge entry point. It routes based on request path:
- `/auth/callback` → exchange code for tokens
- `/auth/logout` → clear cookies, redirect to Cognito logout
- `/api/health` → pass through (ECS health check)
- Everything else → validate JWT or redirect to login

```typescript
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
  config: any,
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
  config: any
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
```

Write to `infra/lambda/edge-auth/index.ts`.

- [ ] **Step 2: Add `@types/aws-lambda` as dev dependency**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra/lambda/edge-auth && npm install --save-dev @types/aws-lambda`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra/lambda/edge-auth && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add infra/lambda/edge-auth/index.ts infra/lambda/edge-auth/package.json infra/lambda/edge-auth/package-lock.json
git commit -m "feat(edge-auth): add Lambda@Edge request handler with routing logic"
```

---

## Task 5: CDK — SecurityStack (Add EdgeAuthClient)

**Files:**
- Modify: `infra/lib/security-stack.ts`

- [ ] **Step 1: Add `edgeClientId` public property and `EdgeAuthClient`**

In `infra/lib/security-stack.ts`, add a new public property `edgeClientId` and create a second UserPoolClient after the existing `DashboardClient` block (after line 81).

Add the public property declaration at line 14 (after `userPoolClient`):

```typescript
  public readonly edgeClientId: string;
```

Add the new client after the existing `this.userPoolClient` block (after line 81) and before the `addDomain` call:

```typescript
    const edgeClient = this.userPool.addClient('EdgeAuthClient', {
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['https://placeholder.cloudfront.net/auth/callback'],
        logoutUrls: ['https://placeholder.cloudfront.net'],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    this.edgeClientId = edgeClient.userPoolClientId;
```

Add a CfnOutput for the edge client ID after the existing outputs (after line 102):

```typescript
    new cdk.CfnOutput(this, 'EdgeAuthClientId', {
      value: edgeClient.userPoolClientId,
      exportName: `${this.stackName}-EdgeAuthClientId`,
    });
```

- [ ] **Step 2: Verify CDK synth**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra && npx cdk synth KiroDashboardSecurity --quiet 2>&1 | tail -5`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/security-stack.ts
git commit -m "feat(security): add public EdgeAuthClient for Lambda@Edge PKCE flow"
```

---

## Task 6: CDK — CdnStack (EdgeFunction + SSM + Callback Update)

**Files:**
- Modify: `infra/lib/cdn-stack.ts`

- [ ] **Step 1: Rewrite cdn-stack.ts with EdgeFunction, SSM, and callback-URL resources**

Replace the entire contents of `infra/lib/cdn-stack.ts`:

```typescript
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface CdnStackProps extends cdk.StackProps {
  alb: elbv2.ApplicationLoadBalancer;
  customSecret: string;
  userPool: cognito.IUserPool;
  edgeClientId: string;
  userPoolDomain: string;
}

export class CdnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const cognitoRegion = 'ap-northeast-2';
    const cognitoDomain = `${props.userPoolDomain}.auth.${cognitoRegion}.amazoncognito.com`;

    // SSM parameter in us-east-1 for Lambda@Edge config
    const ssmConfig = new cr.AwsCustomResource(this, 'SsmEdgeAuthConfig', {
      onCreate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: '/kiro-dashboard/edge-auth/config',
          Value: JSON.stringify({
            userPoolId: props.userPool.userPoolId,
            clientId: props.edgeClientId,
            cognitoDomain,
            cognitoRegion,
          }),
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-east-1',
        physicalResourceId: cr.PhysicalResourceId.of('edge-auth-ssm-config'),
      },
      onUpdate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: '/kiro-dashboard/edge-auth/config',
          Value: JSON.stringify({
            userPoolId: props.userPool.userPoolId,
            clientId: props.edgeClientId,
            cognitoDomain,
            cognitoRegion,
          }),
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-east-1',
        physicalResourceId: cr.PhysicalResourceId.of('edge-auth-ssm-config'),
      },
      onDelete: {
        service: 'SSM',
        action: 'deleteParameter',
        parameters: {
          Name: '/kiro-dashboard/edge-auth/config',
        },
        region: 'us-east-1',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [`arn:aws:ssm:us-east-1:${this.account}:parameter/kiro-dashboard/edge-auth/config`],
        }),
      ]),
    });

    // Lambda@Edge function
    const edgeFunction = new cloudfront.experimental.EdgeFunction(
      this,
      'EdgeAuthFunction',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '..', 'lambda', 'edge-auth'),
          {
            bundling: {
              image: lambda.Runtime.NODEJS_20_X.bundlingImage,
              command: [
                'bash', '-c',
                [
                  'cp -r /asset-input/* /asset-output/',
                  'cd /asset-output',
                  'npm ci --omit=dev',
                  'npx esbuild index.ts --bundle --platform=node --target=node20 --outfile=index.js --external:@aws-sdk/*',
                  'rm -rf node_modules src *.ts tsconfig.json package-lock.json',
                ].join(' && '),
              ],
              user: 'root',
            },
          }
        ),
        timeout: cdk.Duration.seconds(5),
        memorySize: 128,
        stackId: 'KiroDashboardEdgeLambda',
      }
    );

    edgeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:us-east-1:${this.account}:parameter/kiro-dashboard/edge-auth/config`],
      })
    );

    // Ensure SSM is written before Lambda can be invoked
    edgeFunction.node.addDependency(ssmConfig);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(props.alb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          readTimeout: cdk.Duration.seconds(60),
          customHeaders: {
            'X-Custom-Secret': props.customSecret,
          },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        edgeLambdas: [
          {
            functionVersion: edgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    // Update Cognito EdgeAuthClient callback URLs with actual CF domain
    new cr.AwsCustomResource(this, 'UpdateEdgeClientCallbackUrls', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          ClientId: props.edgeClientId,
          CallbackURLs: [
            `https://${distribution.distributionDomainName}/auth/callback`,
          ],
          LogoutURLs: [
            `https://${distribution.distributionDomainName}`,
          ],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['openid', 'email', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        region: cognitoRegion,
        physicalResourceId: cr.PhysicalResourceId.of('update-edge-client-urls'),
      },
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          ClientId: props.edgeClientId,
          CallbackURLs: [
            `https://${distribution.distributionDomainName}/auth/callback`,
          ],
          LogoutURLs: [
            `https://${distribution.distributionDomainName}`,
          ],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['openid', 'email', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        region: cognitoRegion,
        physicalResourceId: cr.PhysicalResourceId.of('update-edge-client-urls'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['cognito-idp:UpdateUserPoolClient'],
          resources: [props.userPool.userPoolArn],
        }),
      ]),
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: `${this.stackName}-CloudFrontURL`,
    });
  }
}
```

Write the full file to `infra/lib/cdn-stack.ts`.

- [ ] **Step 2: Verify CDK synth**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra && npx cdk synth KiroDashboardCdn --quiet 2>&1 | tail -5`
Expected: No errors. (May show warnings about cross-stack references — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add infra/lib/cdn-stack.ts
git commit -m "feat(cdn): add Lambda@Edge, SSM config, and Cognito callback URL update"
```

---

## Task 7: CDK — Wire bin/app.ts

**Files:**
- Modify: `infra/bin/app.ts`

- [ ] **Step 1: Update CdnStack instantiation to pass Cognito props**

In `infra/bin/app.ts`, replace the CdnStack instantiation (lines 35-40) with:

```typescript
new CdnStack(app, 'KiroDashboardCdn', {
  env,
  description: 'Kiro Dashboard - CloudFront distribution + Lambda@Edge auth',
  alb: ecsStack.alb,
  customSecret: ecsStack.customSecret,
  userPool: securityStack.userPool,
  edgeClientId: securityStack.edgeClientId,
  userPoolDomain: `kiro-dashboard-${env.account}`,
});
```

- [ ] **Step 2: Full CDK synth to verify all 4 stacks**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra && npx cdk synth --quiet 2>&1 | tail -10`
Expected: All 4 stacks synthesize without errors.

- [ ] **Step 3: Commit**

```bash
git add infra/bin/app.ts
git commit -m "feat(infra): wire Cognito props from SecurityStack to CdnStack"
```

---

## Task 8: Remove NextAuth from Application

**Files:**
- Remove: `lib/auth.ts`
- Remove: `app/api/auth/[...nextauth]/route.ts`
- Remove: `app/login/page.tsx`
- Modify: `package.json` (remove `next-auth`)

- [ ] **Step 1: Delete NextAuth files**

```bash
rm lib/auth.ts
rm app/api/auth/\[...nextauth\]/route.ts
rmdir app/api/auth/\[...nextauth\]
rmdir app/api/auth
rm app/login/page.tsx
rmdir app/login
```

- [ ] **Step 2: Remove next-auth from package.json**

In `package.json`, remove the line:
```
    "next-auth": "^4.24.14",
```

- [ ] **Step 3: Run npm install to update lockfile**

Run: `cd /home/ec2-user/my-project/kiro-dashboard && npm install`
Expected: `next-auth` removed from `node_modules` and lockfile updated.

- [ ] **Step 4: Verify build still works**

Run: `cd /home/ec2-user/my-project/kiro-dashboard && npm run build 2>&1 | tail -10`
Expected: Build succeeds. No import errors for `next-auth`.

- [ ] **Step 5: Commit**

```bash
git add -A lib/auth.ts app/api/auth app/login package.json package-lock.json
git commit -m "refactor: remove NextAuth.js — auth now handled by Lambda@Edge"
```

---

## Task 9: Deploy

- [ ] **Step 1: Set CDK environment variables**

Ensure `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` are set:

```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=ap-northeast-2
```

- [ ] **Step 2: Run CDK diff to preview changes**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra && npx cdk diff --all 2>&1`
Expected: Shows new EdgeAuthClient in SecurityStack, new EdgeFunction/SSM/AwsCustomResources in CdnStack. No destructive changes to existing resources.

- [ ] **Step 3: Deploy all stacks**

Run: `cd /home/ec2-user/my-project/kiro-dashboard/infra && npx cdk deploy --all --require-approval never 2>&1`
Expected: All 4 stacks deploy successfully. CdnStack will take ~5-15 minutes (CloudFront distribution update).

- [ ] **Step 4: Verify outputs**

Run: `aws cloudformation describe-stacks --stack-name KiroDashboardCdn --query 'Stacks[0].Outputs' --output table --region ap-northeast-2`
Expected: CloudFrontURL output with `https://dXXXXXX.cloudfront.net`

- [ ] **Step 5: Test the auth flow**

Open the CloudFront URL in a browser. Expected:
1. Redirected to Cognito Hosted UI login page
2. After login → redirected back to dashboard
3. Subsequent page loads work without re-login
4. `/api/health` returns 200 without requiring auth

- [ ] **Step 6: Commit any post-deploy adjustments**

If no changes needed, this step is a no-op.
