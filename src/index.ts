import { HibiraApprovals } from './approvals';
import { HibiraChat } from './chat';
import { type HibiraOptions, type ResolvedOptions, SignedClient, resolveOptions } from './client';
import { type LiveChatUser, liveChatIdentity, liveChatScriptTag } from './livechat';
import { type LiveChatMiddlewareOptions, expressLiveChat, fastifyLiveChat, koaLiveChat } from './middleware';

export * from './approvals';
export * from './chat';
export { HibiraApiError, signQuery, resolveOptions } from './client';
export type { HibiraOptions, Query, ResolvedOptions } from './client';
export * from './livechat';
export * from './middleware';

type MiddlewareOptions<Req> = Omit<LiveChatMiddlewareOptions<Req>, 'workspace' | 'identitySecret'> &
  Partial<Pick<LiveChatMiddlewareOptions<Req>, 'workspace' | 'identitySecret'>>;

export interface Hibira {
  readonly options: ResolvedOptions;
  /** The Chat API: conversations, members, messages, read receipts. */
  readonly chat: HibiraChat;
  /** Hibira Approvals: ask a person for a decision and read the answer. */
  readonly approvals: HibiraApprovals;
  /** Hibira Live Chat helpers, using the configured workspace and identity secret. */
  readonly liveChat: {
    identity(user: LiveChatUser | null | undefined): ReturnType<typeof liveChatIdentity>;
    scriptTag(options?: { user?: LiveChatUser | null; color?: string; lang?: string; launcher?: boolean; nonce?: string }): string;
    express<Req extends object = any>(options: MiddlewareOptions<Req>): ReturnType<typeof expressLiveChat<Req>>;
    koa<Ctx extends { state: Record<string, unknown> } = any>(options: MiddlewareOptions<Ctx>): ReturnType<typeof koaLiveChat<Ctx>>;
    fastify<Req extends object = any>(options: MiddlewareOptions<Req>): ReturnType<typeof fastifyLiveChat<Req>>;
  };
}

/**
 * Creates the Hibira server client. Every option falls back to its
 * environment variable (HIBIRA_APP_ID, HIBIRA_KEY, HIBIRA_SECRET, HIBIRA_HOST,
 * HIBIRA_LIVECHAT_IDENTITY_SECRET, HIBIRA_LIVECHAT_WORKSPACE).
 */
export function createHibira(options: HibiraOptions = {}): Hibira {
  const resolved = resolveOptions(options);
  const client = new SignedClient(resolved);
  const withDefaults = <Req>(o: MiddlewareOptions<Req>): LiveChatMiddlewareOptions<Req> => ({
    ...o,
    workspace: o.workspace ?? resolved.liveChatWorkspace,
    identitySecret: o.identitySecret ?? resolved.liveChatIdentitySecret,
  });
  return {
    options: resolved,
    chat: new HibiraChat(client),
    approvals: new HibiraApprovals(client),
    liveChat: {
      identity: (user) => liveChatIdentity(resolved.liveChatIdentitySecret, user),
      scriptTag: (o = {}) =>
        liveChatScriptTag({ workspace: resolved.liveChatWorkspace ?? '', identitySecret: resolved.liveChatIdentitySecret, ...o }),
      express: (o) => expressLiveChat(withDefaults(o)),
      koa: (o) => koaLiveChat(withDefaults(o)),
      fastify: (o) => fastifyLiveChat(withDefaults(o)),
    },
  };
}
