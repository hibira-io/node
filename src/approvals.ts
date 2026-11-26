import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignedClient, clean, seg } from './client';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | (string & {});

export interface Approval {
  approval_id: string;
  title: string;
  status: ApprovalStatus;
  /** The answer page to share with whoever decides. */
  url: string;
  options?: string[];
  decision?: string;
  decided_by?: string;
  awaiting_reply?: boolean;
  [field: string]: unknown;
}

export interface ApprovalRequest {
  title: string;
  details?: string;
  /** 2 to 4 choices; the first approves. */
  options?: string[];
  /** 1 to 10080 (default 60). */
  expiresInMinutes?: number;
  /** A private channel that gets an `approval` event on request and decision. */
  channel?: string;
  pushInterests?: string[];
  pushUsers?: string[];
  /** Who is asking, such as the agent's name. */
  agent?: string;
  /** Approvals workspace members or groups who may decide. */
  approvers?: string[];
  quorum?: number;
  /** Receives a signed POST when the approval is decided; check it with verifyApprovalCallback(). */
  callbackUrl?: string;
}

export interface ApprovalEvent {
  id: string;
  type: string;
  created_at: string;
  workspace_id?: string;
  data: { approval: Approval };
}

const MAX_WAIT = 25;

/**
 * Hibira Approvals (https://hibira.io/approvals): ask a person for a decision
 * from your app, an agent or a job, and read the answer.
 */
export class HibiraApprovals {
  constructor(private readonly client: SignedClient) {}

  /** Creates an approval and answers it with its answer page in `url`. */
  request(input: ApprovalRequest): Promise<Approval> {
    if (!input?.title?.trim()) throw new TypeError('title is required');
    return this.client.request<Approval>(
      'POST',
      '/approvals',
      {},
      clean({
        title: input.title,
        details: input.details,
        options: input.options,
        expires_in_minutes: input.expiresInMinutes,
        channel: input.channel,
        push_interests: input.pushInterests,
        push_users: input.pushUsers,
        agent: input.agent,
        approvers: input.approvers,
        quorum: input.quorum,
        callback_url: input.callbackUrl,
      }),
    );
  }

  /** An approval's status. `wait` (seconds, up to 25) holds the request until it is answered. */
  get(approvalId: string, options: { wait?: number } = {}): Promise<Approval> {
    const wait = Math.max(0, Math.min(MAX_WAIT, Math.floor(options.wait ?? 0)));
    return this.client.request<Approval>(
      'GET',
      `/approvals/${seg(approvalId)}`,
      wait > 0 ? { wait } : {},
      undefined,
      (wait + 10) * 1000,
    );
  }

  /** Answers an approver's question; `details`, when given, replaces the request's details. */
  reply(approvalId: string, message: string, options: { details?: string } = {}): Promise<Approval> {
    if (!message?.trim()) throw new TypeError('message is required');
    return this.client.request<Approval>(
      'POST',
      `/approvals/${seg(approvalId)}/replies`,
      {},
      clean({ message, details: options.details }),
    );
  }

  /** verifyApprovalCallback() with the app secret, which signs callback_url deliveries. */
  verifyCallback(header: string | null | undefined, body: string | Buffer, now?: number): ApprovalEvent | null {
    return verifyApprovalCallback(this.client.options.secret, header, body, now);
  }

  /** Polls until the approval is no longer pending, or `timeout` seconds (default 3600) pass. */
  async wait(approvalId: string, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<Approval> {
    const deadline = Date.now() + (options.timeout ?? 3600) * 1000;
    for (;;) {
      options.signal?.throwIfAborted();
      const left = (deadline - Date.now()) / 1000;
      const approval = await this.get(approvalId, { wait: Math.max(0, Math.min(left, MAX_WAIT)) });
      if (approval.status !== 'pending' || left <= MAX_WAIT) return approval;
    }
  }
}

/** How old (seconds) a callback's timestamp may be. */
export const CALLBACK_TOLERANCE = 300;

/**
 * Checks a callback_url delivery (or an Approvals workspace webhook, with that
 * endpoint's secret) and answers its event, or null when the signature, the
 * timestamp or the body is wrong. `header` is the Hibira-Signature header
 * ("t=<unix>,v1=<hex>"); `body` must be the raw request body.
 */
export function verifyApprovalCallback(
  secret: string,
  header: string | null | undefined,
  body: string | Buffer,
  now: number = Date.now(),
): ApprovalEvent | null {
  if (!secret || !header) return null;
  let ts = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') ts = v;
    else if (k === 'v1') sigs.push(v);
  }
  const t = Number(ts);
  if (!/^\d+$/.test(ts) || !sigs.length) return null;
  if (Math.abs(now / 1000 - t) > CALLBACK_TOLERANCE) return null;
  const raw = typeof body === 'string' ? Buffer.from(body) : body;
  const want = createHmac('sha256', secret).update(`${ts}.`).update(raw).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return /^[0-9a-f]+$/i.test(s) && got.length === want.length && timingSafeEqual(got, want);
  });
  if (!ok) return null;
  try {
    const event = JSON.parse(raw.toString('utf8'));
    return event && typeof event === 'object' ? (event as ApprovalEvent) : null;
  } catch {
    return null;
  }
}
