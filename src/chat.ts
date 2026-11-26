import { type Query, SignedClient, clean, seg } from './client';

export interface ConversationFields {
  name?: string;
  /** User IDs; leave out to keep the current members. */
  members?: Array<string | number>;
  metadata?: Record<string, unknown>;
  /** `{ user_id: role }` */
  roles?: Record<string, string>;
  /** Up to 10 private or presence channels that also receive the events; leave out to keep them. */
  watchers?: string[];
}

export interface SendMessageOptions {
  name?: string;
  metadata?: Record<string, unknown>;
  /** `offline` (default): push to members who are not connected; `always`; `never`. */
  push?: 'offline' | 'always' | 'never';
  pushTitle?: string;
  pushUrl?: string;
  /** Up to 5 roles that may see the message. */
  visibleTo?: string[];
  idempotencyKey?: string;
}

/**
 * The Chat API (https://hibira.io/chat-api): conversations with stored
 * history, read receipts and offline push. Clients receive `chat.*` events on
 * `#server-to-user-<user_id>` after pusher-js `signin()`.
 */
export class HibiraChat {
  constructor(private readonly client: SignedClient) {}

  /** Any Chat API call, signed. `path` is relative to /apps/APP_ID/chat, e.g. `/conversations/c1/typing`. */
  request<T = Record<string, any>>(method: string, path: string, query: Query = {}, body?: unknown): Promise<T> {
    const verb = method.toUpperCase();
    const p = path.startsWith('/') ? path : `/${path}`;
    const payload = body === undefined && (verb === 'POST' || verb === 'PUT') ? {} : body;
    return this.client.request<T>(verb, `/chat${p}`, query, payload);
  }

  /** Creates or replaces a conversation. */
  putConversation(id: string, fields: ConversationFields = {}) {
    const body = clean({ ...fields, members: fields.members?.map(String) });
    return this.request('PUT', `/conversations/${seg(id)}`, {}, body);
  }

  getConversation(id: string) {
    return this.request('GET', `/conversations/${seg(id)}`);
  }

  /** Deletes a conversation with its members, messages and files. */
  deleteConversation(id: string) {
    return this.request('DELETE', `/conversations/${seg(id)}`);
  }

  addMembers(id: string, userIds: Array<string | number>) {
    return this.request('POST', `/conversations/${seg(id)}/members`, {}, { user_ids: userIds.map(String) });
  }

  removeMember(id: string, userId: string | number) {
    return this.request('DELETE', `/conversations/${seg(id)}/members/${seg(userId)}`);
  }

  /** Posts a message as a member. */
  sendMessage(id: string, userId: string | number, text: string, options: SendMessageOptions = {}) {
    return this.request(
      'POST',
      `/conversations/${seg(id)}/messages`,
      {},
      clean({
        user_id: String(userId),
        text,
        name: options.name,
        metadata: options.metadata,
        push: options.push,
        push_title: options.pushTitle,
        push_url: options.pushUrl,
        visible_to: options.visibleTo,
        idempotency_key: options.idempotencyKey,
      }),
    );
  }

  /** Messages oldest first: after a seq (with limit), or the last n. */
  listMessages(id: string, options: { after?: number; limit?: number; last?: number } = {}) {
    return this.request('GET', `/conversations/${seg(id)}/messages`, options);
  }

  markRead(id: string, userId: string | number, seq: number) {
    return this.request('POST', `/conversations/${seg(id)}/read`, {}, { user_id: String(userId), seq });
  }

  /** A message with no sender, such as "Alice joined". */
  systemMessage(id: string, text: string, metadata?: Record<string, unknown>) {
    return this.request('POST', `/conversations/${seg(id)}/system`, {}, clean({ text, metadata }));
  }

  /** A user's conversations, latest activity first, each with its unread count. */
  userConversations(userId: string | number, options: { limit?: number; before?: string } = {}) {
    return this.request('GET', `/users/${seg(userId)}/conversations`, options);
  }
}
