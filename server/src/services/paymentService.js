import crypto from 'node:crypto';
import { Payment } from '../models/Payment.js';
import { Order } from '../models/Order.js';
import { env, onlinePaymentsConfigured } from '../config/env.js';
import { bad, conflict, forbidden, notFound, HttpError } from '../utils/errors.js';
import { randomHex, timingSafeEqualStr } from '../utils/misc.js';
import { assignToken } from './tokenService.js';
import { audit } from '../models/AuditLog.js';

// The only place payment status is changed. Order.paymentStatus is a mirror of Payment.status.
// Reaching PAID is also the single trigger for the sequential token, so no payment path can skip it.
async function mirror(orderId, status, { method, by } = {}) {
  await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: status } });
  if (status !== 'PAID') return;
  await Order.updateOne({ _id: orderId, paidAt: null }, { $set: { paidAt: new Date() } });
  // A capture that arrives after the order was cancelled must never create a pickup; flag it for a manual refund instead.
  const flagged = await Order.updateOne({ _id: orderId, status: 'CANCELLED' }, { $set: { refundRequired: true } });
  await audit(by, 'PAYMENT_CONFIRMED', orderId, { method, lateAfterCancel: flagged.modifiedCount > 0 });
  await assignToken(orderId);
}

export async function initiate(order) {
  if (order.status === 'CANCELLED') throw conflict('This order was cancelled');
  const payment = await Payment.findOne({ order: order._id });
  if (!payment) throw notFound('Payment record missing');
  if (!['DEMO', 'ONLINE'].includes(payment.method)) throw bad('This order is not paid online');
  if (payment.status === 'PAID') throw conflict('Already paid', 'ALREADY_PAID');

  if (payment.method === 'DEMO') {
    if (!env.ALLOW_DEMO_PAYMENTS) throw forbidden('Demo payments are disabled on this server');
    const session = randomHex(12);
    await Payment.updateOne({ _id: payment._id, status: { $in: ['UNPAID', 'FAILED', 'PENDING'] } }, { status: 'PENDING', demoSession: session, isDemo: true, $unset: { failureReason: 1 } });
    await mirror(order._id, 'PENDING');
    return { method: 'DEMO', isDemo: true, sessionId: session, amount: payment.amount, notice: 'DEMO payment: no real money is charged.' };
  }

  if (!onlinePaymentsConfigured()) throw new HttpError(503, 'Online payments are not configured on this server. Use cash on pickup.', 'ONLINE_NOT_CONFIGURED');
  // Razorpay Orders API (scaffold, untested without real credentials)
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: payment.amount * 100, currency: 'INR', receipt: order.orderNumber }),
  });
  if (!res.ok) throw new HttpError(502, 'The payment provider could not start this payment. Try again.', 'PROVIDER_ERROR');
  const data = await res.json();
  await Payment.updateOne({ _id: payment._id }, { status: 'PENDING', providerOrderId: data.id });
  await mirror(order._id, 'PENDING');
  return { method: 'ONLINE', keyId: env.RAZORPAY_KEY_ID, providerOrderId: data.id, amount: payment.amount };
}

export async function confirmDemo(order, { sessionId, outcome }) {
  if (!env.ALLOW_DEMO_PAYMENTS) throw forbidden('Demo payments are disabled on this server');
  const next = outcome === 'success' ? { status: 'PAID', paidAt: new Date(), isDemo: true } : { status: 'FAILED', failureReason: 'Demo payment declined' };
  const updated = await Payment.findOneAndUpdate(
    { order: order._id, method: 'DEMO', status: 'PENDING', demoSession: sessionId },
    { ...next, $unset: { demoSession: 1 } },
    { new: true }
  );
  if (!updated) throw conflict('No pending demo payment matches this session', 'NO_PENDING_PAYMENT');
  await mirror(order._id, updated.status, { method: 'DEMO' });
  return updated;
}

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

export async function verifyOnline(order, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!onlinePaymentsConfigured()) throw new HttpError(503, 'Online payments are not configured', 'ONLINE_NOT_CONFIGURED');
  const expected = hmac(env.RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!timingSafeEqualStr(expected, razorpay_signature)) throw bad('Payment signature is invalid', 'BAD_SIGNATURE');
  return markOnlinePaid(razorpay_order_id, razorpay_payment_id, order._id);
}

async function markOnlinePaid(providerOrderId, providerPaymentId, orderId) {
  const filter = { method: 'ONLINE', status: { $in: ['PENDING', 'FAILED'] }, providerOrderId };
  if (orderId) filter.order = orderId;
  const updated = await Payment.findOneAndUpdate(filter, { status: 'PAID', paidAt: new Date(), providerPaymentId }, { new: true });
  if (!updated) throw conflict('No pending online payment matches', 'NO_PENDING_PAYMENT');
  await mirror(updated.order, 'PAID', { method: 'ONLINE' });
  return updated;
}

// Provider webhook: authenticated by HMAC over the raw request body.
export async function handleWebhook(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook secret not configured', 'ONLINE_NOT_CONFIGURED');
  const expected = hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (!signature || !timingSafeEqualStr(expected, signature)) throw bad('Invalid webhook signature', 'BAD_SIGNATURE');
  const evt = JSON.parse(rawBody.toString('utf8'));
  const entity = evt?.payload?.payment?.entity;
  if (!entity?.order_id) return { ignored: true };
  const payment = await Payment.findOne({ providerOrderId: entity.order_id });
  if (!payment) return { ignored: true };
  if (evt.event === 'payment.captured') {
    if (entity.amount !== payment.amount * 100) throw bad('Amount mismatch');
    await markOnlinePaid(entity.order_id, entity.id).catch(() => {}); // idempotent
  } else if (evt.event === 'payment.failed') {
    await Payment.updateOne({ _id: payment._id, status: 'PENDING' }, { status: 'FAILED', failureReason: entity.error_description || 'Payment failed' });
    await mirror(payment.order, 'FAILED');
  }
  return { ok: true };
}

export async function confirmCash(order, admin) {
  const fresh = await Order.findById(order._id).select('status');
  if (!fresh || fresh.status === 'CANCELLED') throw conflict('This order was cancelled', 'ORDER_CANCELLED');
  const updated = await Payment.findOneAndUpdate(
    { order: order._id, method: 'CASH_ON_PICKUP', status: { $in: ['UNPAID', 'FAILED'] } },
    { status: 'PAID', paidAt: new Date(), verifiedBy: admin._id },
    { new: true }
  );
  if (!updated) throw conflict('Cash payment cannot be confirmed for this order', 'NOT_CASH_OR_ALREADY_PAID');
  await mirror(order._id, 'PAID', { method: 'CASH_ON_PICKUP', by: admin });
  return updated;
}

export async function createPaymentRecord({ order, student, method, amount }) {
  return Payment.create({ order, student, method, amount, status: 'UNPAID', isDemo: method === 'DEMO' });
}
