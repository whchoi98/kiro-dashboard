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
