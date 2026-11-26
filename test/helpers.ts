import { createHmac, createHash } from 'node:crypto';
import { type IncomingMessage, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { createHibira } from '../src';

export interface Seen {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string;
}

export async function fakeApi(responses: Array<{ status?: number; body?: unknown }>) {
  const seen: Seen[] = [];
  const server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const url = new URL(req.url ?? '/', 'http://x');
    seen.push({ method: req.method ?? '', path: url.pathname, query: Object.fromEntries(url.searchParams), body: Buffer.concat(chunks).toString() });
    const next = responses.shift() ?? { status: 200, body: {} };
    res.statusCode = next.status ?? 200;
    res.setHeader('content-type', 'application/json');
    res.end(next.body === undefined ? '' : typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const hibira = createHibira({ appId: '1', key: 'app-key', secret: 'app-secret', host: '127.0.0.1', port, useTLS: false });
  return { hibira, seen, close: () => new Promise((r) => server.close(r)) };
}

export function assertSigned(s: Seen) {
  const q = { ...s.query };
  const signature = q.auth_signature;
  delete q.auth_signature;
  const sorted = Object.keys(q)
    .sort()
    .map((k) => `${k}=${q[k]}`)
    .join('&');
  const want = createHmac('sha256', 'app-secret').update(`${s.method}\n${decodeURIComponent(s.path)}\n${sorted}`).digest('hex');
  assert.equal(signature, want);
  assert.equal(q.auth_key, 'app-key');
  assert.equal(q.auth_version, '1.0');
  if (s.body) assert.equal(q.body_md5, createHash('md5').update(s.body).digest('hex'));
  else assert.equal(q.body_md5, undefined);
}

export function userQuery(s: Seen) {
  const q = { ...s.query };
  for (const k of ['auth_key', 'auth_timestamp', 'auth_version', 'auth_signature', 'body_md5']) delete q[k];
  return q;
}
