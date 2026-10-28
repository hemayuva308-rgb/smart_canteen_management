import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, teardown, api, makeUser, placeOrder, confirmCash, readyOrder, claim } from './helpers.js';
import { env } from '../src/config/env.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { User } from '../src/models/User.js';
import { Counter } from '../src/models/Counter.js';

let admin, student;
before(async () => { await setup(); admin = await makeUser('ADMIN'); student = await makeUser('STUDENT'); });
after(teardown);

const overview = async () => (await api().get('/api/admin/overview').set(admin.auth)).body;

test('sales count only real, paid, non-cancelled orders; unpaid, cancelled and demo are excluded', async () => {
  await Order.deleteMany({}); await Payment.deleteMany({}); await Counter.deleteMany({});
  const base = await overview();
  assert.equal(base.salesToday, 0);

  const unpaid = await placeOrder(student, { qty: 2 });                       // cash, never confirmed
  assert.equal((await overview()).salesToday, 0);
  assert.equal((await overview()).awaitingPayment, 1);

  const cash = await placeOrder(student, { qty: 5 });                         // ₹60
  await confirmCash(admin, cash.body.order._id);
  let o = await overview();
  assert.equal(o.salesToday, 60); assert.equal(o.cashReceivedToday, 60); assert.equal(o.todayOrders, 1);

  const demo = await placeOrder(student, { method: 'DEMO', qty: 10 });        // ₹120 of play money
  const init = await api().post(`/api/orders/${demo.body.order._id}/payment/initiate`).set(student.auth);
  await api().post(`/api/orders/${demo.body.order._id}/payment/demo-confirm`).set(student.auth).send({ sessionId: init.body.sessionId, outcome: 'success' });
  o = await overview();
  assert.equal(o.salesToday, 60);                                             // demo is not revenue
  assert.deepEqual(o.demoExcludedToday, { orders: 1, amount: 120 });

  const cancelled = await placeOrder(student, { qty: 1 });
  await confirmCash(admin, cancelled.body.order._id);
  assert.equal((await overview()).salesToday, 72);
  await api().post(`/api/admin/orders/${cancelled.body.order._id}/cancel`).set(admin.auth).send({});
  o = await overview();
  assert.equal(o.salesToday, 60);                                             // cancelled paid order leaves the total
  assert.equal(o.todayOrders, 1);
  assert.ok(unpaid);
});

test('duplicate payment confirmations are not counted twice', async () => {
  await Order.deleteMany({}); await Payment.deleteMany({});
  const a = await placeOrder(student, { qty: 5 });                             // ₹60
  await confirmCash(admin, a.body.order._id);
  for (let i = 0; i < 3; i++) assert.equal((await confirmCash(admin, a.body.order._id)).status, 409);
  const o = await overview();
  assert.equal(o.salesToday, 60); assert.equal(o.todayOrders, 1);
});

test('online and cash received are split on the dashboard', async () => {
  await Order.deleteMany({}); await Payment.deleteMany({});
  const s = await makeUser('STUDENT');
  const c = await placeOrder(s, { qty: 3 });                                    // ₹36 cash
  await confirmCash(admin, c.body.order._id);
  const o = await overview();
  assert.equal(o.salesToday, 36); assert.equal(o.cashReceivedToday, 36); assert.equal(o.onlineReceivedToday, 0);
});

test('picked-up orders leave the actionable queue but remain in all-orders history', async () => {
  await Order.deleteMany({});
  const a = await readyOrder(student, admin);
  const b = await readyOrder(student, admin);
  let q = (await api().get('/api/admin/queue').set(admin.auth)).body.queue;
  assert.deepEqual(q.map((o) => o.tokenNumber), [a.token, b.token].sort((x, y) => x - y));
  assert.equal((await overview()).queueSize, 2);
  await claim(student, a.orderId);
  q = (await api().get('/api/admin/queue').set(admin.auth)).body.queue;
  assert.deepEqual(q.map((o) => o.tokenNumber), [b.token]);
  assert.equal((await overview()).queueSize, 1);
  assert.equal(JSON.stringify(q).toLowerCase().includes('pickuptoken'), false);
  const all = await api().get('/api/admin/orders?status=COLLECTED').set(admin.auth);
  assert.equal(all.body.orders.length, 1);                                   // still there for records
  // sales are not reduced by pickup
  assert.ok((await overview()).salesToday > 0);
});

test('staff-only: overview, queue, session and desk endpoints reject students and visitors', async () => {
  for (const [m, p] of [['get', '/api/admin/overview'], ['get', '/api/admin/queue'], ['get', '/api/admin/session'], ['post', '/api/admin/pickup/lookup'], ['post', '/api/admin/pickup/complete']]) {
    assert.equal((await api()[m](p)).status, 401, p);
    assert.equal((await api()[m](p).set(student.auth)).status, 403, p);
  }
});

// ---------- online payment provider ----------
const hook = (body, secret = 'whsec_x') => {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return api().post('/api/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);
};
const captured = (orderId, payId, amount) => ({ event: 'payment.captured', payload: { payment: { entity: { id: payId, order_id: orderId, amount } } } });

test('online payment: a signed capture pays and numbers the order once; replays change nothing', async () => {
  env.RAZORPAY_KEY_ID = 'k'; env.RAZORPAY_KEY_SECRET = 's'; env.RAZORPAY_WEBHOOK_SECRET = 'whsec_x';
  try {
    const o = await placeOrder(student, { method: 'ONLINE', qty: 2 });
    const id = o.body.order._id;
    await Payment.updateOne({ order: id }, { status: 'PENDING', providerOrderId: 'order_A' });
    assert.equal((await Order.findById(id)).tokenNumber, null);
    const body = captured('order_A', 'pay_A', 2400);
    assert.equal((await hook(body)).status, 200);
    const t = (await Order.findById(id)).tokenNumber;
    assert.ok(t >= 1);
    for (let i = 0; i < 3; i++) await hook(body);
    assert.equal((await Order.findById(id)).tokenNumber, t);
    assert.equal(await Payment.countDocuments({ order: id, status: 'PAID' }), 1);
    // wrong amount is refused and pays nothing
    const o2 = await placeOrder(student, { method: 'ONLINE', qty: 2 });
    await Payment.updateOne({ order: o2.body.order._id }, { status: 'PENDING', providerOrderId: 'order_B' });
    assert.equal((await hook(captured('order_B', 'pay_B', 100))).status, 400);
    assert.equal((await Order.findById(o2.body.order._id)).tokenNumber, null);
  } finally { env.RAZORPAY_KEY_ID = env.RAZORPAY_KEY_SECRET = env.RAZORPAY_WEBHOOK_SECRET = ''; }
});

test('a provider capture arriving AFTER cancellation gets no token and is flagged for refund', async () => {
  env.RAZORPAY_KEY_ID = 'k'; env.RAZORPAY_KEY_SECRET = 's'; env.RAZORPAY_WEBHOOK_SECRET = 'whsec_x';
  try {
    const o = await placeOrder(student, { method: 'ONLINE', qty: 1 });
    const id = o.body.order._id;
    await Payment.updateOne({ order: id }, { status: 'PENDING', providerOrderId: 'order_C' });
    await api().post(`/api/admin/orders/${id}/cancel`).set(admin.auth).send({});
    await hook(captured('order_C', 'pay_C', 1200));
    const fresh = await Order.findById(id);
    assert.equal(fresh.status, 'CANCELLED');
    assert.equal(fresh.tokenNumber, null);
    assert.equal(fresh.refundRequired, true);
    assert.equal((await claim(student, id)).status, 409);
  } finally { env.RAZORPAY_KEY_ID = env.RAZORPAY_KEY_SECRET = env.RAZORPAY_WEBHOOK_SECRET = ''; }
});

test('the browser never receives any payment secret', async () => {
  env.RAZORPAY_KEY_ID = 'rzp_pub'; env.RAZORPAY_KEY_SECRET = 'rzp_SECRET_VALUE'; env.RAZORPAY_WEBHOOK_SECRET = 'whsec_SECRET_VALUE';
  try {
    const bodies = [];
    bodies.push((await api().get('/api/config')).text);
    const o = await placeOrder(student, { method: 'DEMO' });
    bodies.push(JSON.stringify(o.body));
    bodies.push((await api().get(`/api/orders/${o.body.order._id}`).set(student.auth)).text);
    bodies.push((await api().get('/api/admin/overview').set(admin.auth)).text);
    for (const b of bodies) assert.equal(/SECRET_VALUE/.test(b), false);
  } finally { env.RAZORPAY_KEY_ID = env.RAZORPAY_KEY_SECRET = env.RAZORPAY_WEBHOOK_SECRET = ''; }
});
