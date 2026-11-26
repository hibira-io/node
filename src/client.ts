import { createHash, createHmac } from 'node:crypto';

export interface HibiraOptions {
  /** App ID. Default: `HIBIRA_APP_ID`. */
  appId?: string | number;
  /** App key. Default: `HIBIRA_KEY`. */
  key?: string;
  /** App secret. Default: `HIBIRA_SECRET`. Never send it to a browser. */
  secret?: string;
  /** API host, as shown on the app page. Default: `HIBIRA_HOST`, then `ws.hibira.io`. */
  host?: string;
  /** API port. Default: `HIBIRA_PORT`, then the scheme's port. */
  port?: number;
  /** Use HTTPS. Default: `HIBIRA_USE_TLS` (unless "false"), then true. */
  useTLS?: boolean;
  /** Request timeout in milliseconds. Default: 15000. */
  timeout?: number;
  /** Live Chat › Settings › Widget › Verified visitors secret. Default: `HIBIRA_LIVECHAT_IDENTITY_SECRET`. */
  liveChatIdentitySecret?: string;
  /** Live Chat workspace ID for the widget script tag. Default: `HIBIRA_LIVECHAT_WORKSPACE`. */
  liveChatWorkspace?: string;
  /** A fetch implementation; defaults to the global one (Node 18+). */
  fetch?: typeof fetch;
}

export interface ResolvedOptions {
  appId: string;
  key: string;
  secret: string;
  host: string;
  port?: number;
  useTLS: boolean;
  timeout: number;
  liveChatIdentitySecret?: string;
  liveChatWorkspace?: string;
  fetch: typeof fetch;
}

const env = (name: string): string | undefined => {
  const v = typeof process !== 'undefined' ? process.env[name] : undefined;
  return v === undefined || v === '' ? undefined : v;
};

export function resolveOptions(options: HibiraOptions = {}): ResolvedOptions {
  const tls = options.useTLS ?? (env('HIBIRA_USE_TLS') ? env('HIBIRA_USE_TLS') !== 'false' : true);
  const port = options.port ?? (env('HIBIRA_PORT') ? Number(env('HIBIRA_PORT')) : undefined);
  return {
    appId: String(options.appId ?? env('HIBIRA_APP_ID') ?? ''),
    key: options.key ?? env('HIBIRA_KEY') ?? '',
    secret: options.secret ?? env('HIBIRA_SECRET') ?? '',
    host: options.host ?? env('HIBIRA_HOST') ?? 'ws.hibira.io',
    port,
    useTLS: tls,
    timeout: options.timeout ?? 15000,
    liveChatIdentitySecret: options.liveChatIdentitySecret ?? env('HIBIRA_LIVECHAT_IDENTITY_SECRET'),
    liveChatWorkspace: options.liveChatWorkspace ?? env('HIBIRA_LIVECHAT_WORKSPACE'),
    fetch: options.fetch ?? globalThis.fetch,
  };
}

/** Thrown when a Hibira API answers with an error status. */
export class HibiraApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Hibira API ${status}: ${describe(body)}`);
    this.name = 'HibiraApiError';
  }
}

function describe(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) return String((body as { error: unknown }).error);
  return typeof body === 'string' ? body : JSON.stringify(body);
}

export type Query = Record<string, string | number | boolean | undefined>;

/**
 * The signed query string of a Channels-protocol HTTP API request
 * (auth_version 1.0): HMAC-SHA256 over "METHOD\npath\nsorted query".
 */
export function signQuery(
  method: string,
  path: string,
  query: Query,
  body: string | undefined,
  credentials: { key: string; secret: string; timestamp?: number },
): string {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params[k] = String(v);
  params.auth_key = credentials.key;
  params.auth_timestamp = String(credentials.timestamp ?? Math.floor(Date.now() / 1000));
  params.auth_version = '1.0';
  if (body !== undefined) params.body_md5 = createHash('md5').update(body).digest('hex');
  const keys = Object.keys(params).sort();
  const sorted = keys.map((k) => `${k}=${params[k]}`).join('&');
  const signature = createHmac('sha256', credentials.secret).update(`${method.toUpperCase()}\n${path}\n${sorted}`).digest('hex');
  const out = new URLSearchParams();
  for (const k of keys) out.append(k, params[k]);
  out.append('auth_signature', signature);
  return out.toString();
}

/** Encodes one path segment and refuses an empty ID. */
export function seg(value: string | number): string {
  const s = String(value ?? '');
  if (!s) throw new TypeError('an ID is required');
  return encodeURIComponent(s);
}

export class SignedClient {
  constructor(readonly options: ResolvedOptions) {}

  /** A signed request to /apps/APP_ID + resource. Answers the parsed JSON, or {} for an empty body. */
  async request<T = Record<string, any>>(
    method: string,
    resource: string,
    query: Query = {},
    body?: unknown,
    timeout?: number,
  ): Promise<T> {
    const { appId, key, secret, host, port, useTLS } = this.options;
    const missing = [!appId && 'HIBIRA_APP_ID', !key && 'HIBIRA_KEY', !secret && 'HIBIRA_SECRET'].filter(Boolean);
    if (missing.length) throw new Error(`Hibira is not configured: set ${missing.join(', ')}`);
    if (!resource.startsWith('/')) throw new TypeError('resource must start with "/"');
    const verb = method.toUpperCase();
    const path = `/apps/${encodeURIComponent(appId)}${resource}`;
    const content = body === undefined ? undefined : JSON.stringify(body);
    const qs = signQuery(verb, decodeURIComponent(path), query, content, { key, secret });
    const origin = `${useTLS ? 'https' : 'http'}://${host}${port ? `:${port}` : ''}`;
    const res = await this.options.fetch(`${origin}${path}?${qs}`, {
      method: verb,
      headers: content === undefined ? {} : { 'content-type': 'application/json' },
      body: content,
      signal: AbortSignal.timeout(timeout ?? this.options.timeout),
    });
    const text = await res.text();
    let data: unknown = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) throw new HibiraApiError(res.status, data);
    return data as T;
  }
}

export function clean<T extends object>(fields: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}
