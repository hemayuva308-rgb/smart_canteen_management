import { Router } from 'express';
import fs from 'node:fs';
import pathMod from 'node:path';
import { z } from 'zod';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { requireStudent } from '../middleware/auth.js';
import { validate } from '../middleware/common.js';
import { asyncHandler, notFound, bad } from '../utils/errors.js';
import { orderToClient, pickupState } from '../utils/serialize.js';
import { oid } from '../utils/misc.js';
import { env, onlinePaymentsConfigured } from '../config/env.js';
import * as orders from '../services/orderService.js';
import * as payments from '../services/paymentService.js';
import { currentSession } from '../services/tokenService.js';
import { pickupCodeFor } from '../services/qrService.js';

const r = Router();

// ---------- public ----------
// Menu photos uploaded by staff are public (they are shown on the menu). The file name must be our own hash + extension.
r.get('/menu-images/:file', (req, res, next) => {
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(req.params.file)) return next(notFound('Image not found'));
  const file = pathMod.resolve(env.UPLOAD_DIR, 'menu', req.params.file);
  if (!fs.existsSync(file)) return next(notFound('Image not found'));
  res.set({ 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(file);
});

r.get('/config', asyncHandler(async (_req, res) => {
  res.json({ demoPaymentsEnabled: env.ALLOW_DEMO_PAYMENTS, onlinePaymentsEnabled: onlinePaymentsConfigured() });
}));

r.get('/menu', asyncHandler(async (req, res) => {
  const { q, category } = req.query;
  const filter = { isArchived: false };
  if (typeof category === 'string' && category) filter.category = category;
  if (typeof q === 'string' && q.trim()) filter.name = { $regex: q.trim().slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const items = await MenuItem.find(filter).sort({ category: 1, name: 1 });
  const categories = await MenuItem.distinct('category', { isArchived: false });
  res.json({ items, categories: categories.sort() });
}));

// ---------- student only ----------
const mine = [requireStudent];

const createSchema = z.object({
  items: z.array(z.object({ menuItemId: z.string().regex(/^[a-f0-9]{24}$/), quantity: z.number().int().min(1).max(10) }).strict()).min(1).max(20),
  paymentMethod: z.enum(['ONLINE', 'DEMO', 'CASH_ON_PICKUP']),
  note: z.string().trim().max(200).optional(),
}).strict();

r.post('/orders', mine, validate(createSchema), asyncHandler(async (req, res) => {
  const order = await orders.createOrder(req.user, req.body);
  res.status(201).json({ order: orderToClient(order), pickup: pickupState(order) });
}));

const ACTIVE = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'];
// scope=active: orders still in progress. scope=history: finished (picked up / cancelled). Nothing is ever deleted; history keeps every record.
r.get('/orders', mine, asyncHandler(async (req, res) => {
  const scope = ['active', 'history', 'all'].includes(req.query.scope) ? req.query.scope : 'all';
  const filter = { student: req.user._id };
  if (scope === 'active') filter.status = { $in: ACTIVE };
  if (scope === 'history') filter.status = { $nin: ACTIVE };
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const list = await Order.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json({ scope, orders: list.map((o) => ({ ...orderToClient(o), pickup: pickupState(o) })) });
}));

async function ownOrder(req) {
  const order = await Order.findOne({ _id: oid(req.params.id), student: req.user._id }); // 404 for other students' orders
  if (!order) throw notFound('Order not found');
  return order;
}

r.get('/orders/:id', mine, asyncHandler(async (req, res) => {
  const order = await ownOrder(req);
  const payment = await Payment.findOne({ order: order._id });
  res.json({
    order: orderToClient(order),
    pickup: pickupState(order),
    payment: payment && { method: payment.method, status: payment.status, amount: payment.amount, isDemo: payment.isDemo, paidAt: payment.paidAt },
  });
}));

// Personal pickup QR for the counter. Only the owner can fetch it; it carries no personal data, only a signed order id.
r.get('/orders/:id/qr', mine, asyncHandler(async (req, res) => {
  const order = await ownOrder(req);
  if (['COLLECTED', 'CANCELLED'].includes(order.status)) throw bad(`This order is ${order.status.toLowerCase()}. Its QR is no longer needed.`, 'QR_NOT_NEEDED');
  res.json({ code: pickupCodeFor(order) });
}));

// There is deliberately no student-side "claim" route: food is handed over only when staff scan the student's QR
// (POST /api/admin/scan, then POST /api/admin/pickup/complete), so a QR can be used exactly once.

// Pickup queue: tokens only, no names. Shows where the student's own orders stand.
r.get('/queue', mine, asyncHandler(async (req, res) => {
  const session = await currentSession();
  const list = await Order.find({ tokenSession: session, tokenNumber: { $ne: null }, status: { $in: ['CONFIRMED', 'PREPARING', 'READY'] } })
    .sort({ tokenNumber: 1 }).limit(300).select('tokenNumber status student');
  const toBePrepared = list.filter((o) => o.status !== 'READY');
  res.json({
    session,
    preparing: toBePrepared.map((o) => o.tokenNumber),
    ready: list.filter((o) => o.status === 'READY').map((o) => o.tokenNumber),
    mine: list.filter((o) => String(o.student) === String(req.user._id)).map((o) => ({ orderId: o._id, token: o.tokenNumber, status: o.status, ahead: o.status === 'READY' ? 0 : toBePrepared.filter((x) => x.tokenNumber < o.tokenNumber).length })),
  });
}));

r.post('/orders/:id/cancel', mine, asyncHandler(async (req, res) => {
  const o = await ownOrder(req);
  res.json({ order: await orders.cancelOrder(o._id, req.user, { asStudent: true }) });
}));

r.post('/orders/:id/payment/initiate', mine, asyncHandler(async (req, res) => {
  const o = await ownOrder(req);
  res.json(await payments.initiate(o));
}));

const demoSchema = z.object({ sessionId: z.string().min(8).max(64), outcome: z.enum(['success', 'fail']) }).strict();
r.post('/orders/:id/payment/demo-confirm', mine, validate(demoSchema), asyncHandler(async (req, res) => {
  const o = await ownOrder(req);
  const p = await payments.confirmDemo(o, req.body);
  res.json({ status: p.status, isDemo: true });
}));

const onlineSchema = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() });
r.post('/orders/:id/payment/verify', mine, validate(onlineSchema), asyncHandler(async (req, res) => {
  const o = await ownOrder(req);
  const p = await payments.verifyOnline(o, req.body);
  res.json({ status: p.status });
}));

export default r;
