import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, api, makeUser, placeOrder, readyOrder, claim, confirmCash } from './helpers.js';
import { Order } from '../src/models/Order.js';
import { AuditLog } from '../src/models/AuditLog.js';

let student, admin;
before(async () => { await setup(); student = await makeUser('STUDENT'); admin = await makeUser('ADMIN'); });
after(teardown);

const receipt = (s, id) => api().get(`/api/orders/${id}`).set(s.auth);

test('the six-character pickup code is gone from the API and from stored orders', async () => {
  const o = await placeOrder(student);
  assert.equal(o.status, 201);
  assert.equal('pickupToken' in o.body.order, false);
  const view = await receipt(student, o.body.order._id);
  assert.equal(JSON.stringify(view.body).toLowerCase().includes('pickuptoken'), false);
  assert.equal((await Order.collection.findOne({ _id: (await Order.findById(o.body.order._id))._id })).pickupToken, undefined);
});

test('status can only move forward through the kitchen flow, and COLLECTED only via pickup', async () => {
  const o = await placeOrder(student);
  const id = o.body.order._id;
  await confirmCash(admin, id);
  const patch = (status) => api().patch(`/api/admin/orders/${id}/status`).set(admin.auth).send({ status });
  assert.equal((await patch('COLLECTED')).status, 400);
  assert.equal((await patch('PREPARING')).status, 200);
  assert.equal((await patch('CONFIRMED')).status, 409); // cannot go backwards
  assert.equal((await patch('READY')).status, 200);
});

test('the kitchen cannot start an order whose payment is not confirmed', async () => {
  const o = await placeOrder(student);
  const r = await api().patch(`/api/admin/orders/${o.body.order._id}/status`).set(admin.auth).send({ status: 'PREPARING' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'PAYMENT_NOT_VERIFIED');
});

test('pickup is refused until the order is READY, and the receipt says so', async () => {
  const o = await placeOrder(student);
  const id = o.body.order._id;
  await confirmCash(admin, id);
  let r = await claim(student, id);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'NOT_READY');
  assert.equal((await receipt(student, id)).body.pickup.status, 'NOT_READY');
  assert.equal((await Order.findById(id)).status, 'CONFIRMED');
});

test('an unpaid order cannot be handed over even if staff force it to READY in the database', async () => {
  const o = await placeOrder(student); // cash, unpaid
  await Order.updateOne({ _id: o.body.order._id }, { status: 'READY' }); // simulate corrupt/forced state
  const r = await claim(student, o.body.order._id);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'PAYMENT_NOT_VERIFIED');
});

test('duplicate pickup: refreshing, resubmitting or scanning the same QR again cannot collect twice', async () => {
  const { orderId } = await readyOrder(student, admin);
  assert.equal((await claim(student, orderId)).status, 200);
  const again = await claim(student, orderId);
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ALREADY_COLLECTED');
  // the receipt still opens (as a record) but offers no action
  const view = await receipt(student, orderId);
  assert.equal(view.status, 200);
  assert.equal(view.body.pickup.status, 'PICKED_UP');
});

test('concurrent hand-overs of one order: exactly one wins', async () => {
  const { orderId } = await readyOrder(student, admin);
  const results = await Promise.all([1, 2, 3, 4].map(() => claim(student, orderId)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));
  assert.equal((await Order.findById(orderId)).status, 'COLLECTED');
});

test("students have no way to collect an order themselves, and cannot see another student's order", async () => {
  const other = await makeUser('STUDENT');
  const { orderId } = await readyOrder(student, admin);
  // the old student-side claim route is gone: owner, other student and anonymous callers all get 404
  assert.equal((await api().post(`/api/orders/${orderId}/claim`).set(student.auth).send({})).status, 404);
  assert.equal((await api().post(`/api/orders/${orderId}/claim`).set(other.auth).send({})).status, 404);
  assert.equal((await receipt(other, orderId)).status, 404);
  assert.equal((await Order.findById(orderId)).status, 'READY');
});

test('the staff pickup endpoint needs a staff login and rejects unknown fields', async () => {
  const { orderId } = await readyOrder(student, admin);
  const url = '/api/admin/pickup/complete';
  assert.equal((await api().post(url).send({ orderId })).status, 401);
  assert.equal((await api().post(url).set(student.auth).send({ orderId })).status, 403);
  assert.equal((await api().post(url).set(admin.auth).send({ orderId, status: 'COLLECTED' })).status, 400);
  assert.equal((await Order.findById(orderId)).status, 'READY');
});

test('a cancelled order cannot be handed over', async () => {
  const { orderId } = await readyOrder(student, admin);
  assert.equal((await api().post(`/api/admin/orders/${orderId}/cancel`).set(admin.auth).send({ reason: 'test' })).status, 200);
  const r = await claim(student, orderId);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ORDER_CANCELLED');
});

test('lists: completed orders leave the active list but stay in history and in the database', async () => {
  const s = await makeUser('STUDENT');
  const done = await readyOrder(s, admin);
  const open = await placeOrder(s);
  await claim(s, done.orderId);
  const active = await api().get('/api/orders?scope=active').set(s.auth);
  const history = await api().get('/api/orders?scope=history').set(s.auth);
  assert.deepEqual(active.body.orders.map((o) => o._id), [open.body.order._id]);
  assert.deepEqual(history.body.orders.map((o) => o._id), [done.orderId]);
  // refreshing never resurrects it
  const again = await api().get('/api/orders?scope=active').set(s.auth);
  assert.equal(again.body.orders.some((o) => o._id === done.orderId), false);
  // retained for audit
  assert.ok(await Order.findById(done.orderId));
  assert.ok(await AuditLog.findOne({ action: 'ORDER_PICKED_UP', subject: done.orderId }));
});

test('only staff can complete a pickup, and a second attempt is refused', async () => {
  const { orderId } = await readyOrder(student, admin);
  assert.equal((await api().post('/api/admin/pickup/complete').set(student.auth).send({ orderId })).status, 403);
  const r = await api().post('/api/admin/pickup/complete').set(admin.auth).send({ orderId });
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'COLLECTED');
  assert.equal((await api().post('/api/admin/pickup/complete').set(admin.auth).send({ orderId })).status, 409);
});
