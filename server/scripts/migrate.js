// Idempotent upgrade for databases created before sequential tokens. Safe to run repeatedly; also runs at server start.
//  1. drops the unique index on the retired 6-character pickupToken (otherwise every new order, which has none, would collide),
//  2. removes the retired code from existing orders (it is a credential, not an audit record),
//  3. back-fills Order.paidAt from the payment record (sales are reported by payment time),
//  4. gives tokens, in order of creation, to paid orders that are still active but were placed before this upgrade.
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { assignToken } from '../src/services/tokenService.js';

export async function runMigrations(log = () => {}) {
  const col = Order.collection;
  const report = { droppedIndex: false, codesRemoved: 0, paidAtBackfilled: 0, tokensAssigned: 0 };

  try {
    await col.dropIndex('pickupToken_1');
    report.droppedIndex = true;
  } catch (e) {
    if (!['IndexNotFound', 'NamespaceNotFound'].includes(e.codeName) && ![26, 27].includes(e.code)) throw e;
  }

  report.codesRemoved = (await col.updateMany({ pickupToken: { $exists: true } }, { $unset: { pickupToken: '' } })).modifiedCount;

  for await (const o of Order.find({ paymentStatus: 'PAID', paidAt: null }).select('_id updatedAt').cursor()) {
    const p = await Payment.findOne({ order: o._id }).select('paidAt');
    await Order.updateOne({ _id: o._id, paidAt: null }, { $set: { paidAt: p?.paidAt || o.updatedAt } });
    report.paidAtBackfilled++;
  }

  const legacy = await Order.find({ paymentStatus: 'PAID', tokenNumber: null, status: { $in: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'] } }).sort({ createdAt: 1 }).select('_id');
  for (const { _id } of legacy) {
    await assignToken(_id);
    report.tokensAssigned++;
  }
  log(report);
  return report;
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const { connectDb, disconnectDb } = await import('../src/config/db.js');
  await connectDb();
  console.log('Migration result:', await runMigrations());
  await disconnectDb();
}
