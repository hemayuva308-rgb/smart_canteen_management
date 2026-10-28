import mongoose from 'mongoose';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { env, onlinePaymentsConfigured } from '../config/env.js';
import { bad, conflict, forbidden, HttpError } from '../utils/errors.js';
import { randomCode } from '../utils/misc.js';
import { createPaymentRecord } from './paymentService.js';
import { audit } from '../models/AuditLog.js';

export const FLOW = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'];

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `TT-${ymd}-${randomCode(4)}`;
}

export async function createOrder(student, { items, paymentMethod, note }) {
  // Merge duplicate lines, then price everything from the database. Client prices are never accepted.
  const merged = new Map();
  for (const { menuItemId, quantity } of items) merged.set(menuItemId, (merged.get(menuItemId) || 0) + quantity);
  const ids = [...merged.keys()];
  const menu = await MenuItem.find({ _id: { $in: ids }, isArchived: false });
  if (menu.length !== ids.length) throw bad('One or more items are no longer on the menu', 'ITEM_MISSING');

  const lines = [];
  for (const m of menu) {
    const quantity = merged.get(String(m._id));
    if (quantity > 10) throw bad(`You can order at most 10 of ${m.name}`, 'QTY_LIMIT');
    if (!m.isAvailable) throw conflict(`${m.name} is not available right now`, 'ITEM_UNAVAILABLE');
    lines.push({ menuItem: m._id, name: m.name, unitPrice: m.price, quantity, lineTotal: m.price * quantity });
  }
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const method = paymentMethod;
  if (method === 'DEMO' && !env.ALLOW_DEMO_PAYMENTS) throw forbidden('Demo payments are disabled on this server');
  if (method === 'ONLINE' && !onlinePaymentsConfigured()) throw new HttpError(503, 'Online payments are not configured on this server', 'ONLINE_NOT_CONFIGURED');

  const orderId = new mongoose.Types.ObjectId();
  const amountDue = total;

  try {
    let order;
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      try {
        order = await Order.create({
          _id: orderId,
          orderNumber: orderNumber(),
          student: student._id,
          items: lines,
          total,
          amountDue,
          paymentMethod: method,
          paymentStatus: 'UNPAID',
          note,
          statusHistory: [{ status: 'PLACED', by: student._id }],
        });
      } catch (e) {
        if (e.code !== 11000 || attempt === 4) throw e; // regenerate number/token on rare collision
      }
    }
    await createPaymentRecord({ order: order._id, student: student._id, method, amount: amountDue });
    await audit(student, 'ORDER_PLACED', order._id, { orderNumber: order.orderNumber, total, method });
    return Order.findById(order._id);
  } catch (e) {
    throw e;
  }
}

export async function advanceStatus(orderId, next, admin) {
  if (!FLOW.includes(next)) throw bad('Status can only move through PLACED, CONFIRMED, PREPARING, READY. Use pickup to collect or cancel to cancel.', 'BAD_STATUS');
  const order = await Order.findById(orderId);
  if (!order) throw bad('Order not found');
  if (FLOW.indexOf(next) <= FLOW.indexOf(order.status) || !FLOW.includes(order.status)) {
    throw conflict(`Order is already ${order.status}`, 'BAD_TRANSITION');
  }
  // Nothing is prepared or served before payment is confirmed (cash must be confirmed by staff first).
  if (order.paymentStatus !== 'PAID') throw conflict('Payment is not confirmed yet. Confirm the payment first.', 'PAYMENT_NOT_VERIFIED');
  if (order.tokenNumber == null) throw conflict('This order has no token yet', 'NO_TOKEN');
  const set = { status: next };
  if (next === 'READY') set.readyAt = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: order.status },
    { $set: set, $push: { statusHistory: { status: next, by: admin._id } } },
    { new: true }
  );
  if (!updated) throw conflict('Order changed. Refresh and try again.', 'STALE');
  return updated;
}

export async function cancelOrder(orderId, actor, { asStudent, reason } = {}) {
  const order = await Order.findById(orderId);
  if (!order) throw bad('Order not found');
  const allowed = asStudent ? ['PLACED'] : ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'];
  if (!allowed.includes(order.status)) throw conflict(`An order that is ${order.status} cannot be cancelled${asStudent ? ' by you. Ask the canteen staff.' : ''}`, 'BAD_TRANSITION');
  if (asStudent && order.paymentStatus === 'PENDING') throw conflict('Payment is in progress. Wait for it to finish or ask the canteen staff.', 'PAYMENT_PENDING');

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: allowed } },
    {
      $set: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason || (asStudent ? 'Cancelled by student' : 'Cancelled by canteen'), refundRequired: order.paymentStatus === 'PAID' && order.amountDue > 0 },
      $push: { statusHistory: { status: 'CANCELLED', by: actor._id } },
    },
    { new: true }
  );
  if (!updated) throw conflict('Order changed. Refresh and try again.', 'STALE');
  await Payment.updateOne({ order: updated._id, status: 'PENDING' }, { status: 'FAILED', failureReason: 'Order cancelled' });
  if (order.paymentStatus === 'PENDING') await Order.updateOne({ _id: updated._id }, { paymentStatus: 'FAILED' });
  return updated;
}
