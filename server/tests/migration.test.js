import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setup, teardown, makeUser } from './helpers.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { Counter } from '../src/models/Counter.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { runMigrations } from '../scripts/migrate.js';

let student;
before(async () => { await setup(); student = await makeUser('STUDENT'); });
after(teardown);

async function legacyOrder({ code, status, paymentStatus, createdAt }) {
  const item = await MenuItem.findOne({ name: 'Masala Chai' });
  const _id = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({
    _id, orderNumber: `TT-OLD-${code}`, student: student.user._id, status, paymentStatus, paymentMethod: 'CASH_ON_PICKUP',
    items: [{ menuItem: item._id, name: item.name, unitPrice: 12, quantity: 1, lineTotal: 12 }],
    total: 12, amountDue: 12, pickupToken: code, statusHistory: [], createdAt, updatedAt: createdAt,
  });
  await Payment.collection.insertOne({ order: _id, student: student.user._id, method: 'CASH_ON_PICKUP', status: paymentStatus, amount: 12, paidAt: paymentStatus === 'PAID' ? createdAt : undefined, createdAt, updatedAt: createdAt });
  return _id;
}

test('upgrade: the old unique pickupToken index is dropped, legacy codes removed, paid active orders numbered in order', async () => {
  await Order.collection.createIndex({ pickupToken: 1 }, { unique: true });   // what an existing database has
  await Counter.deleteMany({});
  const t0 = Date.now();
  const first = await legacyOrder({ code: 'AAAAAA', status: 'PREPARING', paymentStatus: 'PAID', createdAt: new Date(t0 - 3000) });
  const second = await legacyOrder({ code: 'BBBBBB', status: 'READY', paymentStatus: 'PAID', createdAt: new Date(t0 - 2000) });
  const unpaid = await legacyOrder({ code: 'CCCCCC', status: 'PLACED', paymentStatus: 'UNPAID', createdAt: new Date(t0 - 1000) });
  const done = await legacyOrder({ code: 'DDDDDD', status: 'COLLECTED', paymentStatus: 'PAID', createdAt: new Date(t0 - 5000) });

  // BEFORE: a new-style order (no pickupToken) would collide on the old index with the second one
  const item = await MenuItem.findOne({ name: 'Masala Chai' });
  const mk = () => Order.collection.insertOne({ orderNumber: `X${Math.random()}`, student: student.user._id, status: 'PLACED', items: [], total: 1 });
  await mk();
  await assert.rejects(mk(), /E11000/);
  await Order.collection.deleteMany({ orderNumber: /^X/ });
  assert.ok(item);

  const report = await runMigrations();
  assert.equal(report.droppedIndex, true);
  assert.equal(report.codesRemoved, 4);
  assert.equal(report.tokensAssigned, 2);

  await mk(); await mk();                                                       // AFTER: no collision
  await Order.collection.deleteMany({ orderNumber: /^X/ });

  const get = (id) => Order.findById(id);
  assert.equal((await get(first)).tokenNumber, 1);
  assert.equal((await get(second)).tokenNumber, 2);
  assert.equal((await get(second)).status, 'READY');                           // never moved backwards
  assert.equal((await get(unpaid)).tokenNumber, null);                         // unpaid stays tokenless
  assert.equal((await get(done)).tokenNumber, null);                           // finished orders are history, not renumbered
  assert.equal((await Order.collection.findOne({ _id: first })).pickupToken, undefined);
  assert.ok((await get(first)).paidAt);

  const again = await runMigrations();                                         // idempotent
  assert.deepEqual(again, { droppedIndex: false, codesRemoved: 0, paidAtBackfilled: 0, tokensAssigned: 0 });
  assert.equal((await get(first)).tokenNumber, 1);
});
