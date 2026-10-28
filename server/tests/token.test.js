import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, api, makeUser, placeOrder, confirmCash } from './helpers.js';
import { Order } from '../src/models/Order.js';
import { Counter } from '../src/models/Counter.js';
import { User } from '../src/models/User.js';
import { Setting } from '../src/models/Setting.js';
import { assignToken, currentSession } from '../src/services/tokenService.js';
import { AuditLog } from '../src/models/AuditLog.js';

let admin, student;
before(async () => { await setup(); admin = await makeUser('ADMIN'); student = await makeUser('STUDENT'); });
after(teardown);

const tokenOf = async (id) => (await Order.findById(id)).tokenNumber;
const demoPay = async (s, orderId) => {
  const init = await api().post(`/api/orders/${orderId}/payment/initiate`).set(s.auth);
  return api().post(`/api/orders/${orderId}/payment/demo-confirm`).set(s.auth).send({ sessionId: init.body.sessionId, outcome: 'success' });
};

test('no token exists until payment is confirmed (cash stays tokenless until staff confirm)', async () => {
  const o = await placeOrder(student);
  assert.equal(o.body.order.token, null);
  assert.equal(o.body.pickup.status, 'AWAITING_PAYMENT');
  assert.equal(await tokenOf(o.body.order._id), null);
  const c = await confirmCash(admin, o.body.order._id);
  assert.equal(c.status, 200);
  const t = await tokenOf(o.body.order._id);
  assert.ok(Number.isInteger(t) && t >= 1);
  const fresh = await Order.findById(o.body.order._id);
  assert.equal(fresh.status, 'CONFIRMED'); // paid + numbered = confirmed
  assert.ok(fresh.paidAt);
});

test('tokens are 1, 2, 3 ... in the order payments are confirmed, and restart per session', async () => {
  await Order.deleteMany({}); await Counter.deleteMany({}); await Setting.updateOne({ key: 'main' }, { $unset: { serviceSession: 1 } });
  const orders = [];
  for (let i = 0; i < 4; i++) orders.push((await placeOrder(student)).body.order._id);
  // confirm out of placement order: tokens follow PAYMENT order, not order of placement
  for (const idx of [2, 0, 3, 1]) await confirmCash(admin, orders[idx]);
  // confirmed order was: orders[2], orders[0], orders[3], orders[1]  ->  tokens 1, 2, 3, 4
  assert.deepEqual(await Promise.all(orders.map(tokenOf)), [2, 4, 1, 3]);
  // a different student's order continues the same sequence
  const s2 = await makeUser('STUDENT');
  const x = (await placeOrder(s2)).body.order._id; await confirmCash(admin, x);
  assert.equal(await tokenOf(x), 5);
});

test('simultaneous payments never duplicate or skip a token', async () => {
  await Order.deleteMany({}); await Counter.deleteMany({});
  const ids = [];
  for (let i = 0; i < 12; i++) ids.push((await placeOrder(student)).body.order._id);
  await Promise.all(ids.map((id) => confirmCash(admin, id)));
  const tokens = (await Promise.all(ids.map(tokenOf))).sort((a, b) => a - b);
  assert.deepEqual(tokens, Array.from({ length: 12 }, (_, i) => i + 1));
});

test('calling assignToken repeatedly and in parallel gives one order exactly one token and burns no numbers', async () => {
  await Order.deleteMany({}); await Counter.deleteMany({});
  const a = (await placeOrder(student)).body.order._id;
  await confirmCash(admin, a);
  const before = await tokenOf(a);
  await Promise.all(Array.from({ length: 8 }, () => assignToken(a)));
  assert.equal(await tokenOf(a), before);
  const b = (await placeOrder(student)).body.order._id;
  await Promise.all(Array.from({ length: 8 }, () => Promise.all([assignToken(b), confirmCash(admin, b).catch(() => {})])));
  assert.equal(await tokenOf(b), before + 1); // no gap
});

test('a repeated payment confirmation is rejected and does not change the token', async () => {
  const o = (await placeOrder(student)).body.order._id;
  assert.equal((await confirmCash(admin, o)).status, 200);
  const t = await tokenOf(o);
  const dup = await confirmCash(admin, o);
  assert.equal(dup.status, 409);
  assert.equal(await tokenOf(o), t);
  assert.equal(await AuditLog.countDocuments({ action: 'TOKEN_ASSIGNED', subject: o }), 1);
});

test('every payment path issues a token: demo (failed demo gets none)', async () => {
  const s = await makeUser('STUDENT');
  const d = (await placeOrder(s, { method: 'DEMO' })).body.order._id;
  assert.equal(await tokenOf(d), null);
  assert.equal((await demoPay(s, d)).status, 200);
  assert.ok(await tokenOf(d));
  // failed demo payment gets no token
  const f = (await placeOrder(s, { method: 'DEMO' })).body.order._id;
  const init = await api().post(`/api/orders/${f}/payment/initiate`).set(s.auth);
  await api().post(`/api/orders/${f}/payment/demo-confirm`).set(s.auth).send({ sessionId: init.body.sessionId, outcome: 'fail' });
  assert.equal(await tokenOf(f), null);
});

test('a cancelled unpaid order never gets a token, and cash cannot be confirmed on a cancelled order', async () => {
  const o = (await placeOrder(student)).body.order._id;
  assert.equal((await api().post(`/api/orders/${o}/cancel`).set(student.auth)).status, 200);
  assert.equal((await confirmCash(admin, o)).status, 400);
  assert.equal(await tokenOf(o), null);
  await assignToken(o);
  assert.equal(await tokenOf(o), null);
});

test('a new service session restarts numbering at 1 and never renumbers old orders', async () => {
  await Order.deleteMany({}); await Counter.deleteMany({}); await Setting.updateOne({ key: 'main' }, { $unset: { serviceSession: 1 } });
  const a = (await placeOrder(student, )).body.order._id; await confirmCash(admin, a);
  assert.equal(await tokenOf(a), 1);
  // still active in this session: starting another is refused unless forced
  const refused = await api().post('/api/admin/session/start').set(admin.auth).send({ label: 'Lunch' });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'ACTIVE_ORDERS_REMAIN');
  const before = await currentSession();
  const ok = await api().post('/api/admin/session/start').set(admin.auth).send({ label: 'Lunch', force: true });
  assert.equal(ok.status, 201);
  assert.notEqual(ok.body.session, before);
  const b = (await placeOrder(student, )).body.order._id; await confirmCash(admin, b);
  assert.equal(await tokenOf(b), 1);          // restarted
  assert.equal(await tokenOf(a), 1);          // old one untouched
  assert.equal((await Order.findById(a)).tokenSession, before);
  assert.notEqual((await Order.findById(b)).tokenSession, before);
  assert.equal((await api().post('/api/admin/session/start').set(student.auth).send({})).status, 403);
});

test('with automatic daily sessions, a stale session from yesterday rolls over to a fresh one', async () => {
  const s = await Setting.findOne({ key: 'main' });
  await Setting.updateOne({ key: 'main' }, { $set: { 'serviceSession.id': '2000-01-01-S1' } });
  const id = await currentSession();
  assert.notEqual(id, '2000-01-01-S1');
  assert.equal(id, (await Setting.findOne({ key: 'main' })).serviceSession.id);
  assert.ok(s);
});

test('the database itself refuses a duplicate token within a session', async () => {
  await Order.init();
  const a = (await placeOrder(student)).body.order._id; await confirmCash(admin, a);
  const o = await Order.findById(a);
  const b = (await placeOrder(student)).body.order._id;
  await assert.rejects(Order.updateOne({ _id: b }, { $set: { tokenNumber: o.tokenNumber, tokenSession: o.tokenSession } }), /E11000|duplicate/i);
});

test('the student queue shows tokens only (no names) and where my order stands', async () => {
  await Order.deleteMany({}); await Counter.deleteMany({});
  const me = await makeUser('STUDENT'); const other = await makeUser('STUDENT');
  const o1 = (await placeOrder(other)).body.order._id; await confirmCash(admin, o1);
  const o2 = (await placeOrder(me)).body.order._id; await confirmCash(admin, o2);
  const q = await api().get('/api/queue').set(me.auth);
  assert.equal(q.status, 200);
  assert.deepEqual(q.body.preparing, [1, 2]);
  assert.equal(q.body.mine.length, 1);
  assert.equal(q.body.mine[0].token, 2);
  assert.equal(q.body.mine[0].ahead, 1);
  assert.equal(JSON.stringify(q.body).includes(other.user.name), false);
  assert.equal((await api().get('/api/queue')).status, 401);
});
