import './setupEnv.js'; // must be first: ES imports are hoisted
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { seedBase } from '../scripts/seed.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Order } from '../src/models/Order.js';

export const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/tapandtake_test';
export const app = createApp();
export const api = () => request(app);

export async function setup() {
  await connectDb(TEST_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes before tests run
  await seedBase();
}
export async function teardown() {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
}

let n = 0;
export async function makeUser(role = 'STUDENT', extra = {}) {
  n += 1;
  const email = `${role.toLowerCase()}${n}@test.local`;
  const password = 'Passw0rd!x';
  const user = await User.create({ name: `${role} ${n}`, email, phone: `98765${String(10000 + n)}`, passwordHash: await bcrypt.hash(password, 4), role, ...extra });
  const path = role === 'ADMIN' ? '/api/auth/admin/login' : '/api/auth/login';
  const res = await api().post(path).send({ email, password });
  return { user, token: res.body.token, email, password, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export async function firstItem(name = 'Masala Chai') {
  return MenuItem.findOne({ name });
}

export async function placeOrder(student, { method = 'CASH_ON_PICKUP', qty = 2, name = 'Masala Chai', ...rest } = {}) {
  const item = await firstItem(name);
  const res = await api().post('/api/orders').set(student.auth).send({ items: [{ menuItemId: String(item._id), quantity: qty }], paymentMethod: method, ...rest });
  return res;
}

export async function confirmCash(admin, orderId) {
  return api().post(`/api/admin/orders/${orderId}/cash-received`).set(admin.auth);
}

// Staff confirm cash if the order is a cash order that is still unpaid, then move it through the kitchen to READY.
export async function advanceToReady(admin, orderId) {
  const o = await Order.findById(orderId);
  if (o.paymentStatus !== 'PAID' && o.paymentMethod === 'CASH_ON_PICKUP') {
    const c = await confirmCash(admin, orderId);
    if (c.status !== 200) throw new Error(`cash confirm failed ${c.status} ${JSON.stringify(c.body)}`);
  }
  for (const status of ['PREPARING', 'READY']) {
    const r = await api().patch(`/api/admin/orders/${orderId}/status`).set(admin.auth).send({ status });
    if (r.status !== 200) throw new Error(`advance failed ${r.status} ${JSON.stringify(r.body)}`);
  }
}

// Students cannot collect on their own: pickup is always done by staff (scan QR -> hand over). The first argument is kept so
// call sites read naturally; the request is made by a shared staff account and the student argument is unused.
let helperStaff;
export async function claim(_student, orderId, body = {}) {
  helperStaff ||= await makeUser('ADMIN');
  return api().post('/api/admin/pickup/complete').set(helperStaff.auth).send({ orderId, ...body });
}

// A paid, READY order for this student. Returns its id and token.
export async function readyOrder(student, admin, opts = {}) {
  const o = await placeOrder(student, opts);
  if (o.status !== 201) throw new Error(`order failed ${o.status} ${JSON.stringify(o.body)}`);
  await advanceToReady(admin, o.body.order._id);
  const fresh = await Order.findById(o.body.order._id);
  return { orderId: o.body.order._id, token: fresh.tokenNumber };
}
