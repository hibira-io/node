import { type LiveChatIdentity, type LiveChatUser, liveChatIdentity, liveChatScriptTag } from './livechat';

/** What the middleware puts on the request: `res.locals`, `ctx.state` or `request`, under `hibiraLiveChat`. */
export interface LiveChatLocals {
  /** Verified-visitor fields for the signed-in user, or null. */
  identity: LiveChatIdentity | null;
  /** The widget's script tag for the page, or "" without a workspace. */
  scriptTag: string;
}

export interface LiveChatMiddlewareOptions<Req> {
  /** The signed-in user for a request ({ id, name?, email? }), or null for a guest. */
  getUser: (request: Req) => LiveChatUser | null | undefined | Promise<LiveChatUser | null | undefined>;
  workspace?: string;
  identitySecret?: string;
  color?: string;
  lang?: string;
  launcher?: boolean;
  /** CSP nonce for the script tag, per request. */
  nonce?: (request: Req) => string | undefined;
}

async function locals<Req>(request: Req, o: LiveChatMiddlewareOptions<Req>): Promise<LiveChatLocals> {
  const user = await o.getUser(request);
  return {
    identity: liveChatIdentity(o.identitySecret, user),
    scriptTag: o.workspace
      ? liveChatScriptTag({
          workspace: o.workspace,
          user,
          identitySecret: o.identitySecret,
          color: o.color,
          lang: o.lang,
          launcher: o.launcher,
          nonce: o.nonce?.(request),
        })
      : '',
  };
}

type ExpressReq = object;
type ExpressRes = { locals: Record<string, unknown> };

/** Express (or Connect) middleware: sets `res.locals.hibiraLiveChat` for your templates. */
export function expressLiveChat<Req extends ExpressReq = any>(options: LiveChatMiddlewareOptions<Req>) {
  return (req: Req, res: ExpressRes, next: (err?: unknown) => void) => {
    locals(req, options).then(
      (value) => {
        res.locals.hibiraLiveChat = value;
        next();
      },
      (err) => next(err),
    );
  };
}

type KoaCtx = { state: Record<string, unknown> };

/** Koa middleware: sets `ctx.state.hibiraLiveChat`. getUser receives the context. */
export function koaLiveChat<Ctx extends KoaCtx = any>(options: LiveChatMiddlewareOptions<Ctx>) {
  return async (ctx: Ctx, next: () => Promise<unknown>) => {
    ctx.state.hibiraLiveChat = await locals(ctx, options);
    await next();
  };
}

/**
 * A Fastify `preHandler` hook: sets `request.hibiraLiveChat`.
 *
 *   fastify.addHook('preHandler', fastifyLiveChat({ getUser: (req) => req.user }))
 */
export function fastifyLiveChat<Req extends object = any>(options: LiveChatMiddlewareOptions<Req>) {
  return async (request: Req) => {
    (request as Req & { hibiraLiveChat?: LiveChatLocals }).hibiraLiveChat = await locals(request, options);
  };
}
