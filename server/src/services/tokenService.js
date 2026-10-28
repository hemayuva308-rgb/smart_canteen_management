import { Order } from '../models/Order.js';
import { Setting, getSettings } from '../models/Setting.js';
import { nextSeq } from '../models/Counter.js';
import { conflict } from '../utils/errors.js';
import { audit } from '../models/AuditLog.js';

const STALE_CLAIM_MS = 30 * 1000;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function rotateSession(expectedId, label, now) {
  const day = ymd(now);
  const n = await nextSeq(`session:${day}`);
  const id = `${day}-S${n}`;
  // Compare-and-set: if another request rotated first, ours matches nothing and we simply use theirs.
  const res = await Setting.findOneAndUpdate(
    { key: 'main', 'serviceSession.id': expectedId ?? null },
    { $set: { serviceSession: { id, label: label || (n === 1 ? 'Daily service' : `Service ${n}`), startedAt: now } } },
    { new: true }
  );
  return (res || (await getSettings())).serviceSession.id;
}

/** The session new tokens are issued in. Rolls over to a fresh session (tokens restart at 1) on a new day. */
export async function currentSession(now = new Date()) {
  const s = await getSettings();
  const cur = s.serviceSession?.id;
  if (cur && (!s.autoDailySession || cur.startsWith(ymd(now)))) return cur;
  return rotateSession(cur, undefined, now);
}

/** Staff-triggered fresh session. Refuses while tokens from the old session are still waiting, unless forced. */
export async function startSession(admin, { label, force } = {}) {
  const cur = (await getSettings()).serviceSession?.id ?? null;
  if (cur && !force) {
    const waiting = await Order.countDocuments({ tokenSession: cur, status: { $in: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'] } });
    if (waiting) throw conflict(`${waiting} order(s) from the current session are still active. Finish them first or confirm to start anyway.`, 'ACTIVE_ORDERS_REMAIN');
  }
  const id = await rotateSession(cur, label, new Date());
  await audit(admin, 'SESSION_STARTED', id, { previous: cur, label, force: !!force });
  return id;
}

/**
 * Gives a PAID order the next token, exactly once.
 *  1. claim the order (only one caller can),
 *  2. take the next number from an atomic counter,
 *  3. write it to the order (guarded by `tokenNumber: null` and a unique index on session+number).
 * Because the claim happens BEFORE the counter is touched, duplicate/parallel calls (webhook + client callback,
 * double taps) never burn a number, so the sequence stays 1, 2, 3 ... without gaps.
 * Safe to call any number of times; returns the up-to-date order.
 */
export async function assignToken(orderId) {
  const now = new Date();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId, paymentStatus: 'PAID', status: { $nin: ['CANCELLED', 'COLLECTED'] }, tokenNumber: null,
      $or: [{ tokenClaimAt: null }, { tokenClaimAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } }],
    },
    { $set: { tokenClaimAt: now } },
    { new: true }
  );
  if (!claimed) return Order.findById(orderId); // already numbered, being numbered by another request, or not eligible

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const session = await currentSession(now);
      const number = await nextSeq(`token:${session}`);
      try {
        const set = { tokenNumber: number, tokenSession: session, tokenAssignedAt: new Date() };
        const updated = await Order.findOneAndUpdate(
          { _id: orderId, tokenNumber: null, status: { $nin: ['CANCELLED', 'COLLECTED'] } },
          { $set: set, $unset: { tokenClaimAt: 1 } },
          { new: true }
        );
        if (!updated) return Order.findById(orderId); // cancelled meanwhile
        // Paid + numbered means "confirmed": move PLACED -> CONFIRMED (conditional, so it never goes backwards).
        const confirmed = await Order.findOneAndUpdate(
          { _id: orderId, status: 'PLACED' },
          { $set: { status: 'CONFIRMED' }, $push: { statusHistory: { status: 'CONFIRMED' } } },
          { new: true }
        );
        await audit(null, 'TOKEN_ASSIGNED', orderId, { token: number, session, orderNumber: updated.orderNumber });
        return confirmed || updated;
      } catch (e) {
        if (e.code !== 11000) throw e; // a duplicate (session, number) can only happen after a crash: take the next number
      }
    }
    throw new Error('Could not allocate a token');
  } catch (e) {
    await Order.updateOne({ _id: orderId, tokenNumber: null }, { $unset: { tokenClaimAt: 1 } }); // release so a retry can succeed
    throw e;
  }
}
