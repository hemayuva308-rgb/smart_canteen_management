import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, teardown, api, makeUser, placeOrder, firstItem } from './helpers.js';
import { env } from '../src/config/env.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';

let student, admin;
before(async () => { await setup(); student = await makeUser('STUDENT'); admin = await makeUser('ADMIN'); });
after(teardown);

test('server computes totals from DB prices and ignores client-supplied prices', async () => {
  const item = await firstItem('Masala Chai'); // ₹12
  const bad = await api().post('/api/orders').set(student.auth).send({ items: [{ menuItemId: String(item._id), quantity: 2, price: 1 }], paymentMethod: 'CASH_ON_PICKUP' });
  assert.equal(bad.status, 400); // unknown fields are rejected, not trusted
  const ok = await placeOrder(student, { qty: 3 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.order.total, 36);
  assert.equal(ok.body.order.items[0].unitPrice, 12);
});

test('quantity validation and unavailable items are enforced', async () => {
  const item = await firstItem('Veg Sandwich');
  const tooMany = await api().post('/api/orders').set(student.auth).send({ items: [{ menuItemId: String(item._id), quantity: 11 }], paymentMethod: 'CASH_ON_PICKUP' });
  assert.equal(tooMany.status, 400);
  const zero = await api().post('/api/orders').set(student.auth).send({ items: [{ menuItemId: String(item._id), quantity: 0 }], paymentMethod: 'CASH_ON_PICKUP' });
  assert.equal(zero.status, 400);
  item.isAvailable = false; await item.save();
  const na = await placeOrder(student, { name: 'Veg Sandwich' });
  assert.equal(na.status, 409);
  item.isAvailable = true; await item.save();
});

test('price snapshot is immutable: later menu edits do not change old orders', async () => {
  const o = await placeOrder(student, { qty: 1, name: 'Samosa (2 pcs)' });
  const item = await firstItem('Samosa (2 pcs)');
  item.price = 99; await item.save();
  const again = await api().get(`/api/orders/${o.body.order._id}`).set(student.auth);
  assert.equal(again.body.order.total, 25);
  item.price = 25; await item.save();
});

test('new cash order is UNPAID and the student cannot make it PAID', async () => {
  const o = await placeOrder(student);
  assert.equal(o.body.order.paymentStatus, 'UNPAID');
  const id = o.body.order._id;
  assert.equal((await api().post(`/api/orders/${id}/payment/initiate`).set(student.auth)).status, 400);
  assert.equal((await api().patch(`/api/orders/${id}`).set(student.auth).send({ paymentStatus: 'PAID' })).status, 404);
  assert.equal((await api().post(`/api/admin/orders/${id}/cash-received`).set(student.auth)).status, 403);
  assert.equal((await Order.findById(id)).paymentStatus, 'UNPAID');
  const paid = await api().post(`/api/admin/orders/${id}/cash-received`).set(admin.auth);
  assert.equal(paid.status, 200);
  assert.equal((await Order.findById(id)).paymentStatus, 'PAID');
  assert.equal((await api().post(`/api/admin/orders/${id}/cash-received`).set(admin.auth)).status, 409); // not twice
});

test('DEMO payment: UNPAID -> PENDING -> PAID only via a server-issued session', async () => {
  const o = await placeOrder(student, { method: 'DEMO' });
  const id = o.body.order._id;
  assert.equal(o.body.order.paymentStatus, 'UNPAID');
  // confirming without initiating must fail
  const early = await api().post(`/api/orders/${id}/payment/demo-confirm`).set(student.auth).send({ sessionId: 'abcdefabcdef', outcome: 'success' });
  assert.equal(early.status, 409);
  assert.equal((await Order.findById(id)).paymentStatus, 'UNPAID');

  const init = await api().post(`/api/orders/${id}/payment/initiate`).set(student.auth);
  assert.equal(init.status, 200);
  assert.equal(init.body.isDemo, true);
  assert.equal((await Order.findById(id)).paymentStatus, 'PENDING');

  const wrong = await api().post(`/api/orders/${id}/payment/demo-confirm`).set(student.auth).send({ sessionId: 'wrongwrongwrong', outcome: 'success' });
  assert.equal(wrong.status, 409);

  const other = await makeUser('STUDENT');
  const stolen = await api().post(`/api/orders/${id}/payment/demo-confirm`).set(other.auth).send({ sessionId: init.body.sessionId, outcome: 'success' });
  assert.equal(stolen.status, 404);

  const ok = await api().post(`/api/orders/${id}/payment/demo-confirm`).set(student.auth).send({ sessionId: init.body.sessionId, outcome: 'success' });
  assert.equal(ok.status, 200);
  assert.equal((await Order.findById(id)).paymentStatus, 'PAID');
  const p = await Payment.findOne({ order: id });
  assert.equal(p.isDemo, true);
  // replay of the same session cannot pay again
  const replay = await api().post(`/api/orders/${id}/payment/demo-confirm`).set(student.auth).send({ sessionId: init.body.sessionId, outcome: 'success' });
  assert.equal(replay.status, 409);
});

test('DEMO payment failure sets FAILED and can be retried', async () => {
  const o = await placeOrder(student, { method: 'DEMO' });
  const id = o.body.order._id;
  const init = await api().post(`/api/orders/${id}/payment/initiate`).set(student.auth);
  await api().post(`/api/orders/${id}/payment/demo-confirm`).set(student.auth).send({ sessionId: init.body.sessionId, outcome: 'fail' });
  assert.equal((await Order.findById(id)).paymentStatus, 'FAILED');
  const retry = await api().post(`/api/orders/${id}/payment/initiate`).set(student.auth);
  assert.equal(retry.status, 200);
  assert.equal((await Order.findById(id)).paymentStatus, 'PENDING');
});

test('demo payments can be disabled by configuration', async () => {
  env.ALLOW_DEMO_PAYMENTS = false;
  try {
    assert.equal((await placeOrder(student, { method: 'DEMO' })).status, 403);
  } finally { env.ALLOW_DEMO_PAYMENTS = true; }
});

test('ONLINE payment is refused clearly when no provider credentials are configured', async () => {
  const r = await placeOrder(student, { method: 'ONLINE' });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'ONLINE_NOT_CONFIGURED');
});

test('provider webhook: bad signature rejected; valid signed capture marks PAID once', async () => {
  env.RAZORPAY_KEY_ID = 'rzp_test_x'; env.RAZORPAY_KEY_SECRET = 'secret_x'; env.RAZORPAY_WEBHOOK_SECRET = 'whsec_x';
  try {
    const o = await placeOrder(student, { method: 'ONLINE', qty: 1 });
    assert.equal(o.status, 201);
    const id = o.body.order._id;
    // simulate that the provider order was already created (initiate calls the real API, which we do not hit in tests)
    await Payment.updateOne({ order: id }, { status: 'PENDING', providerOrderId: 'order_test_1' });
    await Order.updateOne({ _id: id }, { paymentStatus: 'PENDING' });

    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_test_1', amount: 1200 } } } });
    const badSig = await api().post('/api/webhooks/razorpay').set('x-razorpay-signature', 'deadbeef').set('Content-Type', 'application/json').send(body);
    assert.equal(badSig.status, 400);
    assert.equal((await Order.findById(id)).paymentStatus, 'PENDING');

    const sig = crypto.createHmac('sha256', 'whsec_x').update(body).digest('hex');
    const good = await api().post('/api/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(body);
    assert.equal(good.status, 200);
    assert.equal((await Order.findById(id)).paymentStatus, 'PAID');
    const again = await api().post('/api/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(body);
    assert.equal(again.status, 200);
    assert.equal(await Payment.countDocuments({ order: id, status: 'PAID' }), 1);

    // client-side verify with a wrong signature must not pay
    const o2 = await placeOrder(student, { method: 'ONLINE', qty: 1 });
    await Payment.updateOne({ order: o2.body.order._id }, { status: 'PENDING', providerOrderId: 'order_test_2' });
    const v = await api().post(`/api/orders/${o2.body.order._id}/payment/verify`).set(student.auth).send({ razorpay_order_id: 'order_test_2', razorpay_payment_id: 'pay_2', razorpay_signature: 'forged' });
    assert.equal(v.status, 400);
    const goodSig = crypto.createHmac('sha256', 'secret_x').update('order_test_2|pay_2').digest('hex');
    const v2 = await api().post(`/api/orders/${o2.body.order._id}/payment/verify`).set(student.auth).send({ razorpay_order_id: 'order_test_2', razorpay_payment_id: 'pay_2', razorpay_signature: goodSig });
    assert.equal(v2.status, 200);
    assert.equal((await Order.findById(o2.body.order._id)).paymentStatus, 'PAID');
  } finally { env.RAZORPAY_KEY_ID = env.RAZORPAY_KEY_SECRET = env.RAZORPAY_WEBHOOK_SECRET = ''; }
});
