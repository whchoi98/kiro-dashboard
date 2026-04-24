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
