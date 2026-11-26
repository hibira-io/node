import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HibiraApiError } from '../src';
import { assertSigned, fakeApi, userQuery } from './helpers';

test('conversations are signed PUT, GET and DELETE requests', async () => {
  const api = await fakeApi([{ body: { id: 'order 1' } }, { body: { id: 'order 1' } }, { status: 204 }]);
  try {
    await api.hibira.chat.putConversation('order 1', { name: 'Order 1', members: ['u1', 2] });
    await api.hibira.chat.getConversation('order 1');
    assert.deepEqual(await api.hibira.chat.deleteConversation('order 1'), {});
    const [put, get, del] = api.seen;
    assert.equal(put.method, 'PUT');
    assert.equal(put.path, '/apps/1/chat/conversations/order%201');
    assert.deepEqual(JSON.parse(put.body), { name: 'Order 1', members: ['u1', '2'] });
    assert.equal(get.method, 'GET');
    assert.equal(get.body, '');
    assert.equal(del.method, 'DELETE');
    api.seen.forEach(assertSigned);
  } finally {
    await api.close();
  }
});

test('members, messages, read receipts and system messages', async () => {
  const api = await fakeApi([]);
  try {
    const { chat } = api.hibira;
    await chat.addMembers('c1', ['u3', 4]);
    await chat.removeMember('c1', 'u/3');
    await chat.sendMessage('c1', 'u1', 'Hi', { push: 'offline', pushTitle: 'New message', idempotencyKey: 'k1' });
    await chat.listMessages('c1', { after: 5, limit: 20 });
    await chat.markRead('c1', 'u1', 7);
    await chat.systemMessage('c1', 'Alice joined');
    await chat.userConversations('u1', { limit: 10, before: 'c9' });
    await chat.request('POST', '/conversations/c1/typing');
    const s = api.seen;
    assert.deepEqual(JSON.parse(s[0].body), { user_ids: ['u3', '4'] });
    assert.equal(s[1].path, '/apps/1/chat/conversations/c1/members/u%2F3');
    assert.deepEqual(JSON.parse(s[2].body), { user_id: 'u1', text: 'Hi', push: 'offline', push_title: 'New message', idempotency_key: 'k1' });
    assert.deepEqual(userQuery(s[3]), { after: '5', limit: '20' });
    assert.deepEqual(JSON.parse(s[4].body), { user_id: 'u1', seq: 7 });
    assert.deepEqual(JSON.parse(s[5].body), { text: 'Alice joined' });
    assert.equal(s[6].path, '/apps/1/chat/users/u1/conversations');
    assert.deepEqual(userQuery(s[6]), { limit: '10', before: 'c9' });
    assert.equal(s[7].body, '{}');
    s.forEach(assertSigned);
  } finally {
    await api.close();
  }
});

test('API errors throw HibiraApiError with the status', async () => {
  const api = await fakeApi([{ status: 402, body: { error: 'The Chat API is not enabled for this account' } }]);
  try {
    await assert.rejects(api.hibira.chat.getConversation('c1'), (err: unknown) => {
      assert.ok(err instanceof HibiraApiError);
      assert.equal(err.status, 402);
      assert.match(err.message, /not enabled/);
      return true;
    });
    assert.throws(() => api.hibira.chat.getConversation(''), TypeError);
  } finally {
    await api.close();
  }
});
