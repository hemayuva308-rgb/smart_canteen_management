import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, api, makeUser, placeOrder, readyOrder } from './helpers.js';

let admin;
before(async () => { await setup(); admin = await makeUser('ADMIN'); });
after(teardown);

const qrOf = async (s, id) => (await api().get(`/api/orders/${id}/qr`).set(s.auth)).body.code;
const scan = (code) => api().post('/api/admin/scan').set(admin.auth).send({ code });

test('unpaid cash order scans as NOT PAID with a cash-confirm option', async () => {
  const s = await makeUser('STUDENT');
  const o = await placeOrder(s);
  const r = await scan(await qrOf(s, o.body.order._id));
  assert.equal(r.status, 200);
  assert.equal(r.body.verdict, 'NOT_PAID');
  assert.equal(r.body.canCollect, false);
  assert.equal(r.body.canConfirmCash, true);
});

test('paid + ready order scans green, collects once, then scans as ALREADY_COLLECTED', async () => {
  const s = await makeUser('STUDENT');
  const { orderId } = await readyOrder(s, admin);
  const code = await qrOf(s, orderId);
  const r = await scan(code);
  assert.equal(r.body.verdict, 'READY_PAID');
  assert.equal(r.body.canCollect, true);
  const done = await api().post('/api/admin/pickup/complete').set(admin.auth).send({ orderId });
  assert.equal(done.status, 200);
  assert.equal((await scan(code)).body.verdict, 'ALREADY_COLLECTED');
  assert.equal((await api().get(`/api/orders/${orderId}/qr`).set(s.auth)).status, 400); // no QR for a finished order
});

test("another student cannot fetch someone else's QR, and forged codes are refused", async () => {
  const a = await makeUser('STUDENT'), b = await makeUser('STUDENT');
  const o = await placeOrder(a);
  assert.equal((await api().get(`/api/orders/${o.body.order._id}/qr`).set(b.auth)).status, 404);
  const code = await qrOf(a, o.body.order._id);
  const forged = code.slice(0, -2) + (code.endsWith('AA') ? 'BB' : 'AA');
  assert.equal((await scan(forged)).status, 400);
  assert.equal((await api().post('/api/admin/scan').set(a.auth).send({ code })).status, 403); // students cannot scan
});

test('prep list totals the day\'s orders per dish', async () => {
  const s = await makeUser('STUDENT');
  await placeOrder(s, { qty: 3 });
  const list = await api().get('/api/admin/prep-list').set(admin.auth);
  const chai = list.body.items.find((i) => i.name === 'Masala Chai');
  assert.ok(chai.ordered >= 3);
  assert.equal(chai.ordered, chai.paid + chai.unpaid);
});
