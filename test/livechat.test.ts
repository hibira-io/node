import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createHibira, expressLiveChat, koaLiveChat, liveChatIdentity, liveChatScriptTag, liveChatUserHash } from '../src';

const hash = createHmac('sha256', 'idsecret').update('42').digest('hex');

test('user hash and identity', () => {
  assert.equal(liveChatUserHash('idsecret', 42), hash);
  assert.deepEqual(liveChatIdentity('idsecret', { id: 42, name: 'Ann', email: null }), { id: '42', hash, name: 'Ann' });
  assert.equal(liveChatIdentity(undefined, { id: 42 }), null);
  assert.equal(liveChatIdentity('idsecret', null), null);
  assert.throws(() => liveChatUserHash('', 1), TypeError);
});

test('script tag escapes attributes and adds the verified visitor', () => {
  const tag = liveChatScriptTag({ workspace: 'ws_1', user: { id: 42, name: 'A "B" <c>' }, identitySecret: 'idsecret', launcher: false, nonce: 'n1' });
  assert.equal(
    tag,
    `<script async src="https://chat.hibira.io/w/v1.js" data-workspace="ws_1" data-launcher="none" data-user-id="42" data-user-hash="${hash}" data-user-name="A &quot;B&quot; &lt;c&gt;" nonce="n1"></script>`,
  );
  assert.equal(liveChatScriptTag({ workspace: '' }), '');
  assert.doesNotMatch(liveChatScriptTag({ workspace: 'ws_1', user: { id: 42 } }), /user-hash/);
});

test('express and koa middleware set the locals', async () => {
  const res = { locals: {} as Record<string, any> };
  await new Promise<void>((resolve, reject) =>
    expressLiveChat({ workspace: 'ws_1', identitySecret: 'idsecret', getUser: () => ({ id: 42 }) })({}, res, (err) => (err ? reject(err) : resolve())),
  );
  assert.equal(res.locals.hibiraLiveChat.identity.hash, hash);
  assert.match(res.locals.hibiraLiveChat.scriptTag, /data-user-hash/);

  const ctx = { state: {} as Record<string, any> };
  let ran = false;
  await koaLiveChat({ getUser: async () => null })(ctx, async () => {
    ran = true;
  });
  assert.ok(ran);
  assert.deepEqual(ctx.state.hibiraLiveChat, { identity: null, scriptTag: '' });
});

test('createHibira uses the configured workspace and secret', async () => {
  const hibira = createHibira({ liveChatWorkspace: 'ws_9', liveChatIdentitySecret: 'idsecret' });
  assert.equal(hibira.liveChat.identity({ id: 42 })?.hash, hash);
  assert.match(hibira.liveChat.scriptTag({ user: { id: 42 } }), /data-workspace="ws_9".*data-user-hash/);
  const request: Record<string, any> = { user: { id: 42 } };
  await hibira.liveChat.fastify({ getUser: (r: any) => r.user })(request);
  assert.equal(request.hibiraLiveChat.identity.id, '42');
});
