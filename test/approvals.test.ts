import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createHibira, verifyApprovalCallback } from '../src';
import { assertSigned, fakeApi, userQuery } from './helpers';

const approval = (status = 'pending') => ({ approval_id: 'apr_1', title: 'Refund?', status, url: 'https://approvals.hibira.io/a/apr_1' });

test('request posts the fields in snake_case', async () => {
  const api = await fakeApi([{ status: 201, body: approval() }]);
  try {
    const out = await api.hibira.approvals.request({
      title: 'Refund?',
      options: ['Refund', 'Decline'],
      expiresInMinutes: 120,
      callbackUrl: 'https://example.com/hook',
    });
    assert.equal(out.approval_id, 'apr_1');
    const [s] = api.seen;
    assert.equal(s.method, 'POST');
    assert.equal(s.path, '/apps/1/approvals');
    assert.deepEqual(JSON.parse(s.body), { title: 'Refund?', options: ['Refund', 'Decline'], expires_in_minutes: 120, callback_url: 'https://example.com/hook' });
    assertSigned(s);
    assert.throws(() => api.hibira.approvals.request({ title: ' ' }), TypeError);
  } finally {
    await api.close();
  }
});

test('get clamps wait, wait polls until decided, reply answers a question', async () => {
  const api = await fakeApi([{ body: approval() }, { body: approval() }, { body: approval('approved') }, { status: 201, body: approval() }]);
  try {
    await api.hibira.approvals.get('apr_1', { wait: 90 });
    assert.deepEqual(userQuery(api.seen[0]), { wait: '25' });
    const done = await api.hibira.approvals.wait('apr_1', { timeout: 600 });
    assert.equal(done.status, 'approved');
    assert.equal(api.seen.length, 3);
    await api.hibira.approvals.reply('apr_1', 'Staging only; 12 rows.');
    assert.equal(api.seen[3].path, '/apps/1/approvals/apr_1/replies');
    assert.deepEqual(JSON.parse(api.seen[3].body), { message: 'Staging only; 12 rows.' });
    api.seen.forEach(assertSigned);
  } finally {
    await api.close();
  }
});

test('missing credentials name the environment variables', async () => {
  const hibira = createHibira({ appId: '', key: '', secret: '' });
  await assert.rejects(hibira.approvals.get('apr_1'), /HIBIRA_APP_ID, HIBIRA_KEY, HIBIRA_SECRET/);
});

test('verifyApprovalCallback checks the signature and the timestamp', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'approval.decided', created_at: '2026-11-26T00:00:00Z', data: { approval: approval('approved') } });
  const t = 1800000000;
  const sig = createHmac('sha256', 'whsec').update(`${t}.${body}`).digest('hex');
  const now = t * 1000 + 1000;
  assert.equal(verifyApprovalCallback('whsec', `t=${t},v1=${sig}`, body, now)?.data.approval.status, 'approved');
  assert.equal(verifyApprovalCallback('whsec', `t=${t},v1=00,v1=${sig}`, Buffer.from(body), now)?.id, 'evt_1');
  assert.equal(verifyApprovalCallback('other', `t=${t},v1=${sig}`, body, now), null);
  assert.equal(verifyApprovalCallback('whsec', `t=${t},v1=${sig}`, body + ' ', now), null);
  assert.equal(verifyApprovalCallback('whsec', `t=${t},v1=${sig}`, body, now + 301_000), null);
  assert.equal(verifyApprovalCallback('whsec', '', body, now), null);
  assert.equal(verifyApprovalCallback('', `t=${t},v1=${sig}`, body, now), null);
  const hibira = createHibira({ appId: '1', key: 'k', secret: 'whsec' });
  assert.equal(hibira.approvals.verifyCallback(`t=${t},v1=${sig}`, body, now)?.type, 'approval.decided');
});
