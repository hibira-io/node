import { createHmac } from 'node:crypto';

export const LIVE_CHAT_SCRIPT_URL = 'https://chat.hibira.io/w/v1.js';

export interface LiveChatUser {
  id: string | number;
  name?: string | null;
  email?: string | null;
}

export interface LiveChatIdentity {
  id: string;
  hash: string;
  name?: string;
  email?: string;
}

export interface LiveChatScriptOptions {
  /** Live Chat workspace ID. */
  workspace: string;
  /** The signed-in user; with an identity secret they chat as a verified visitor. */
  user?: LiveChatUser | null;
  identitySecret?: string;
  /** Launcher colour, such as "#0a7". */
  color?: string;
  /** Widget language, such as "ja". */
  lang?: string;
  /** false hides the launcher button (open the chat from your own button). */
  launcher?: boolean;
  /** CSP nonce for the script tag. */
  nonce?: string;
}

/** hex(HMAC-SHA256(identity secret, user ID)): the widget's `data-user-hash` for verified visitors. */
export function liveChatUserHash(identitySecret: string, userId: string | number): string {
  if (!identitySecret) throw new TypeError('identitySecret is required');
  return createHmac('sha256', identitySecret).update(String(userId)).digest('hex');
}

/**
 * The verified-visitor fields for a user, or null without a user or an
 * identity secret. Hand it to an SPA and call `HibiraLiveChat.identify(it)`.
 */
export function liveChatIdentity(identitySecret: string | undefined, user: LiveChatUser | null | undefined): LiveChatIdentity | null {
  if (!identitySecret || !user || user.id === undefined || user.id === null || String(user.id) === '') return null;
  const id = String(user.id);
  const out: LiveChatIdentity = { id, hash: liveChatUserHash(identitySecret, id) };
  if (user.name) out.name = String(user.name);
  if (user.email) out.email = String(user.email);
  return out;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Live Chat widget's `<script>` tag, or "" without a workspace. */
export function liveChatScriptTag(options: LiveChatScriptOptions): string {
  if (!options?.workspace) return '';
  const attrs: Array<[string, string]> = [
    ['src', LIVE_CHAT_SCRIPT_URL],
    ['data-workspace', options.workspace],
  ];
  if (options.color) attrs.push(['data-color', options.color]);
  if (options.lang) attrs.push(['data-lang', options.lang]);
  if (options.launcher === false) attrs.push(['data-launcher', 'none']);
  const who = liveChatIdentity(options.identitySecret, options.user);
  if (who) {
    attrs.push(['data-user-id', who.id], ['data-user-hash', who.hash]);
    if (who.name) attrs.push(['data-user-name', who.name]);
    if (who.email) attrs.push(['data-user-email', who.email]);
  }
  if (options.nonce) attrs.push(['nonce', options.nonce]);
  return `<script async ${attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')}></script>`;
}
