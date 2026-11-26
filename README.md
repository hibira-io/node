# @hibira-io/node

The [Hibira](https://hibira.io) server SDK for Node.js. It has no
dependencies and covers the products that the
[`pusher`](https://www.npmjs.com/package/pusher) package does not:

- **Chat API**: conversations with stored history, read receipts and offline push.
- **Live Chat**: verified visitors for the Hibira Live Chat widget, with Express, Koa and Fastify middleware.
- **Approvals**: ask a person for a decision from your app, an agent or a job, and read the answer.

For realtime events and channel auth, use `pusher` pointed at your Hibira
host. For waiting rooms, use
[`@hibira-io/waiting-room`](https://github.com/hibira-io/waiting-room).

## Using an AI coding assistant?

Add the [Hibira MCP server](https://hibira.io/guides) to Claude Code, Cursor
or Codex and ask it to "add Hibira Chat to this app": `setup_project` creates
the app and env values, and `get_integration_guide` hands the assistant these
steps.

## Install

```sh
npm install @hibira-io/node
```

Node 18 or newer. Set the app's credentials from the Hibira console:

```sh
HIBIRA_APP_ID=123
HIBIRA_KEY=...
HIBIRA_SECRET=...            # server only, never in browser code
HIBIRA_HOST=ws.hibira.io     # as shown on the app page
HIBIRA_LIVECHAT_WORKSPACE=ws_...          # Live Chat
HIBIRA_LIVECHAT_IDENTITY_SECRET=...       # Live Chat › Settings › Widget › Verified visitors
```

```ts
import { createHibira } from '@hibira-io/node';

const hibira = createHibira(); // or createHibira({ appId, key, secret, host })
```

## Chat API

The [Chat API](https://hibira.io/chat-api) is in beta per account.

```ts
await hibira.chat.putConversation('order-1042', { name: 'Order #1042', members: ['buyer-7', 'seller-3'] });
await hibira.chat.sendMessage('order-1042', 'seller-3', 'Shipped today!', { push: 'offline' });
await hibira.chat.systemMessage('order-1042', 'Tracking number added');

const page = await hibira.chat.listMessages('order-1042', { after: 0, limit: 50 });
await hibira.chat.markRead('order-1042', 'buyer-7', 12);
const inbox = await hibira.chat.userConversations('buyer-7', { limit: 20 });
```

`getConversation`, `deleteConversation`, `addMembers` and `removeMember`
cover the rest, and `hibira.chat.request('POST', '/conversations/order-1042/typing')`
reaches any other route, signed. Clients receive `chat.*` events on
`#server-to-user-<user_id>` after pusher-js `signin()`. See the
[reference](https://hibira.io/chat-api/reference).

## Live Chat

Put the widget on your pages and let signed-in users chat as themselves. Their
ID is signed with the identity secret, so the inbox shows their name and email
and nobody can pretend to be them.

**Express**

```ts
app.use(hibira.liveChat.express({ getUser: (req) => req.user && { id: req.user.id, name: req.user.name, email: req.user.email } }));
// in a template: <%- hibiraLiveChat.scriptTag %>
```

**Koa**: `app.use(hibira.liveChat.koa({ getUser: (ctx) => ctx.state.user }))` sets `ctx.state.hibiraLiveChat`.

**Fastify**: `fastify.addHook('preHandler', hibira.liveChat.fastify({ getUser: (req) => req.user }))` sets `request.hibiraLiveChat`.

Each sets `{ identity, scriptTag }`. For a single-page app, return
`hibira.liveChat.identity(user)` from an endpoint and call
`HibiraLiveChat.identify(identity)` in the browser. `liveChatUserHash(secret, userId)`
and `liveChatScriptTag({ workspace, user, identitySecret, color, lang, launcher, nonce })`
work without a client.

## Approvals

```ts
let approval = await hibira.approvals.request({
  title: 'Refund order #1042 for $89?',
  details: 'Customer says the parcel arrived damaged.',
  options: ['Refund', 'Decline'], // the first option approves
  expiresInMinutes: 120,
});
// share approval.url with whoever decides, then
approval = await hibira.approvals.wait(approval.approval_id, { timeout: 600 });
if (approval.status === 'approved') await refund(order);
```

`get(id, { wait: 25 })` reads one status, holding the request up to 25
seconds. When an approver asks a question (`approval.awaiting_reply`), answer
with `reply(id, '...')`. `channel`, `approvers`, `quorum` and `callbackUrl`
are passed through. With `callbackUrl` set, Hibira POSTs `approval.decided`
or `approval.expired`, signed with the app secret. Check it with the raw body:

```ts
app.post('/hooks/approvals', express.raw({ type: 'application/json' }), (req, res) => {
  const event = hibira.approvals.verifyCallback(req.get('Hibira-Signature'), req.body);
  if (!event) return res.sendStatus(401);
  // event.data.approval.status
  res.sendStatus(204);
});
```

`verifyApprovalCallback(secret, header, body)` does the same without a client.
API errors throw `HibiraApiError` (`status` and `body`).

## Development

```sh
npm install
npm test
```

## 中文摘要

`@hibira-io/node` 是 [Hibira](https://hibira.io) 的 Node.js 伺服器端 SDK，沒有任何相依套件，補足 `pusher` 套件沒有涵蓋的產品：

- **Chat API**：`hibira.chat` 建立對話、以成員身分發訊息、讀取歷史、標記已讀、系統訊息與使用者的對話列表。
- **Live Chat**：`liveChatUserHash()`、`liveChatIdentity()`、`liveChatScriptTag()` 讓登入使用者以驗證過的身分聊天；提供 Express、Koa、Fastify middleware。
- **Approvals**：`hibira.approvals.request()` 發出需要人決定的請求，`wait()` 等待結果，`verifyApprovalCallback()` 驗證 `callback_url` 的簽名。
- 安裝：`npm install @hibira-io/node`，設定 `HIBIRA_APP_ID` / `HIBIRA_KEY` / `HIBIRA_SECRET`，需要 Node 18 以上。即時事件請用 `pusher` 套件，等候室請用 `@hibira-io/waiting-room`。
