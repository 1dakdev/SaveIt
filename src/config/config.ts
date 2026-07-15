/**
 * Validated application configuration.
 *
 * `load()` reads process.env once and fails fast on an invalid combination so a
 * misconfigured deployment never boots into an insecure state (e.g. dev auth in
 * production). Import the frozen `config` singleton everywhere else.
 */

export type AuthMode = 'oidc' | 'dev';

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  auth: {
    mode: AuthMode;
    // OIDC settings (required when mode === 'oidc')
    issuer?: string;
    jwksUri?: string;
    audience?: string;
  };
}

function load(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const mode = (process.env.AUTH_MODE ?? (isProduction ? 'oidc' : 'dev')) as AuthMode;

  if (mode !== 'oidc' && mode !== 'dev') {
    throw new Error(`AUTH_MODE must be "oidc" or "dev", got "${mode}"`);
  }

  // Hard stop: the dev auth bypass (x-user-id header) must never run in prod.
  if (mode === 'dev' && isProduction) {
    throw new Error('AUTH_MODE=dev is forbidden when NODE_ENV=production');
  }

  const auth: AppConfig['auth'] = { mode };

  if (mode === 'oidc') {
    const issuer = req('OIDC_ISSUER');
    // Default the JWKS URI to the standard OIDC discovery location if not given.
    const jwksUri =
      process.env.OIDC_JWKS_URI ?? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
    auth.issuer = issuer;
    auth.jwksUri = jwksUri;
    auth.audience = process.env.OIDC_AUDIENCE || undefined; // optional; enforced only if set
  }

  return {
    nodeEnv,
    isProduction,
    port: Number(process.env.PORT ?? 3000),
    auth,
  };
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (AUTH_MODE=oidc)`);
  return v;
}

export const config: AppConfig = load();
