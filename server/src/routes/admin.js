import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { z } from 'zod';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { AuditLog } from '../models/AuditLog.js';
import { getSettings } from '../models/Setting.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/common.js';
import { asyncHandler, notFound, bad } from '../utils/errors.js';
import { oid, startOfToday } from '../utils/misc.js';
import * as orders from '../services/orderService.js';
import { confirmCash } from '../services/paymentService.js';
import { orderToClient } from '../utils/serialize.js';
import { currentSession, startSession } from '../services/tokenService.js';
import { parsePickupCode, pickupCodeValid } from '../services/qrService.js';
import { sniffImage } from '../utils/image.js';
import { completePickup } from '../services/pickupService.js';

const r = Router();
r.use(requireAdmin);

const objId = z.string().regex(/^[a-f0-9]{24}$/);
const ACTIVE = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY'];

// ---------- overview ----------
// Every number comes from persisted orders and payments. Sales count only orders that are PAID, not cancelled and not DEMO
// (no real money), so unpaid, cancelled and demo orders can never inflate them.
r.get('/overview', asyncHandler(async (_req, res) => {
  const since = startOfToday();
  const real = { paidAt: { $gte: since }, paymentStatus: 'PAID', status: { $ne: 'CANCELLED' }, paymentMethod: { $ne: 'DEMO' } };
  const [byMethod, demo, awaitingPayment, pending, ready, queue, cashPending, session] = await Promise.all([
    Order.aggregate([{ $match: real }, { $group: { _id: '$paymentMethod', orders: { $sum: 1 }, total: { $sum: '$total' }, collected: { $sum: '$amountDue' } } }]),
    Order.aggregate([{ $match: { paidAt: { $gte: since }, paymentStatus: 'PAID', status: { $ne: 'CANCELLED' }, paymentMethod: 'DEMO' } }, { $group: { _id: null, orders: { $sum: 1 }, total: { $sum: '$total' } } }]),
    Order.countDocuments({ paymentStatus: { $ne: 'PAID' }, status: { $in: ['PLACED'] } }),
    Order.countDocuments({ status: { $in: ['PLACED', 'CONFIRMED', 'PREPARING'] }, paymentStatus: 'PAID' }),
    Order.countDocuments({ status: 'READY' }),
    Order.countDocuments({ status: { $in: ['CONFIRMED', 'PREPARING', 'READY'] }, tokenNumber: { $ne: null } }),
    Order.countDocuments({ paymentMethod: 'CASH_ON_PICKUP', paymentStatus: 'UNPAID', status: { $in: ACTIVE } }),
    currentSession(),
  ]);
  const m = Object.fromEntries(byMethod.map((x) => [x._id, x]));
  const sum = (k) => byMethod.reduce((n, x) => n + (x[k] || 0), 0);
  res.json({
    session,
    todayOrders: sum('orders'),            // paid, non-cancelled, real-money orders confirmed today
    salesToday: sum('total'),
    onlineReceivedToday: m.ONLINE?.collected || 0,
    cashReceivedToday: m.CASH_ON_PICKUP?.collected || 0,
    onlineOrdersToday: m.ONLINE?.orders || 0,
    cashOrdersToday: m.CASH_ON_PICKUP?.orders || 0,
    demoExcludedToday: { orders: demo[0]?.orders || 0, amount: demo[0]?.total || 0 },
    awaitingPayment,
    pendingOrders: pending, readyOrders: ready, queueSize: queue,
    cashAwaiting: cashPending,
  });
}));

// ---------- service session + live queue ----------
r.get('/session', asyncHandler(async (_req, res) => res.json({ session: await currentSession(), settings: (await getSettings()).serviceSession })));
r.post('/session/start', validate(z.object({ label: z.string().trim().max(40).optional(), force: z.boolean().optional() }).strict()), asyncHandler(async (req, res) => {
  res.status(201).json({ session: await startSession(req.user, req.body) });
}));

// Actionable pickup queue: paid orders in token order. Picked-up and cancelled orders are never in here (they stay in history).
r.get('/queue', asyncHandler(async (_req, res) => {
  const list = await Order.find({ status: { $in: ['CONFIRMED', 'PREPARING', 'READY'] }, tokenNumber: { $ne: null } }).sort({ tokenAssignedAt: 1, tokenNumber: 1 }).limit(200).populate('student', 'name');
  res.json({ session: await currentSession(), queue: list.map((o) => view(o)) });
}));

// ---------- menu ----------
const menuSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  category: z.string().trim().min(2).max(40),
  price: z.number().int().min(0).max(5000),
  imageUrl: z.string().trim().max(500).refine((v) => v === '' || /^(https?:\/\/|\/)/.test(v), 'Use an http(s) link or a /path').optional(),
  isVeg: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
}).strict();

// Photo upload for menu items (the canteen's own real photos). Saved on disk, served publicly at /api/menu-images/:file.
const menuUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
r.post('/menu/image', menuUpload.single('photo'), asyncHandler(async (req, res) => {
  const type = req.file && sniffImage(req.file.buffer);
  if (!type) throw bad('Choose a JPEG, PNG or WebP photo (max 3 MB).', 'PHOTO_INVALID');
  const name = `${crypto.createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 16)}.${type.ext}`;
  await fs.mkdir(path.resolve(env.UPLOAD_DIR, 'menu'), { recursive: true });
  await fs.writeFile(path.resolve(env.UPLOAD_DIR, 'menu', name), req.file.buffer);
  res.status(201).json({ imageUrl: `/api/menu-images/${name}` });
}));
r.get('/menu', asyncHandler(async (_req, res) => res.json({ items: await MenuItem.find({ isArchived: false }).sort({ category: 1, name: 1 }) })));
r.post('/menu', validate(menuSchema), asyncHandler(async (req, res) => res.status(201).json({ item: await MenuItem.create(req.body) })));
r.patch('/menu/:id', validate(menuSchema.partial()), asyncHandler(async (req, res) => {
  const item = await MenuItem.findOneAndUpdate({ _id: oid(req.params.id), isArchived: false }, req.body, { new: true, runValidators: true });
  if (!item) throw notFound('Menu item not found');
  res.json({ item });
}));
r.patch('/menu/:id/availability', validate(z.object({ isAvailable: z.boolean() })), asyncHandler(async (req, res) => {
  const item = await MenuItem.findOneAndUpdate({ _id: oid(req.params.id), isArchived: false }, { isAvailable: req.body.isAvailable }, { new: true });
  if (!item) throw notFound('Menu item not found');
  res.json({ item });
}));
r.delete('/menu/:id', asyncHandler(async (req, res) => {
  const item = await MenuItem.findOneAndUpdate({ _id: oid(req.params.id) }, { isArchived: true, isAvailable: false }, { new: true });
  if (!item) throw notFound('Menu item not found');
  res.json({ ok: true });
}));

// ---------- orders ----------
function view(o, extra = {}) {
  const x = orderToClient(o);
  return { ...x, studentName: x.student?.name, student: x.student?._id || x.student, ...extra };
}
r.get('/orders', asyncHandler(async (req, res) => {
  const { status, scope } = req.query;
  const filter = {};
  if (scope === 'active') filter.status = { $in: ACTIVE };
  else if (typeof status === 'string' && status) filter.status = status;
  if (scope === 'today') filter.createdAt = { $gte: startOfToday() };
  const list = await Order.find(filter).sort({ createdAt: 1 }).limit(200).populate('student', 'name'); // name only, no contact details
  // Numbered (paid) orders first, in token order; orders still waiting for payment after them, oldest first.
  const rank = (o) => (o.tokenNumber == null ? [1, +o.createdAt, 0] : [0, +(o.tokenAssignedAt || o.createdAt), o.tokenNumber]);
  list.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  res.json({ orders: list.map((o) => view(o)) });
}));

// Total quantity per dish across orders still to be prepared
r.get('/orders/aggregate', asyncHandler(async (_req, res) => {
  const rows = await Order.aggregate([
    { $match: { status: { $in: ['PLACED', 'CONFIRMED', 'PREPARING'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' }, orders: { $addToSet: '$_id' } } },
    { $project: { _id: 0, name: '$_id', quantity: 1, orders: { $size: '$orders' } } },
    { $sort: { quantity: -1 } },
  ]);
  res.json({ items: rows });
}));

r.patch('/orders/:id/status', validate(z.object({ status: z.string() })), asyncHandler(async (req, res) => {
  res.json({ order: await orders.advanceStatus(oid(req.params.id), req.body.status, req.user) });
}));
r.post('/orders/:id/cancel', validate(z.object({ reason: z.string().trim().max(200).optional() })), asyncHandler(async (req, res) => {
  res.json({ order: await orders.cancelOrder(oid(req.params.id), req.user, { reason: req.body.reason }) });
}));
r.post('/orders/:id/cash-received', asyncHandler(async (req, res) => {
  const order = await Order.findById(oid(req.params.id));
  if (!order) throw notFound('Order not found');
  if (order.status === 'CANCELLED') throw bad('Order is cancelled');
  const p = await confirmCash(order, req.user);
  res.json({ payment: p });
}));

// ---------- pickup: the only way an order is collected. Staff scan the QR (above), or look up the token here as a fallback ----------
r.post('/pickup/lookup', validate(z.object({ token: z.coerce.number().int().min(1).max(100000) }).strict()), asyncHandler(async (req, res) => {
  const o = await Order.findOne({ tokenNumber: req.body.token, tokenSession: await currentSession() }).populate('student', 'name');
  if (!o) throw notFound(`No order has token ${req.body.token} in the current session`);
  res.json({ order: view(o) });
}));
const pickupSchema = z.object({ orderId: objId }).strict();
r.post('/pickup/complete', validate(pickupSchema), asyncHandler(async (req, res) => {
  const { order } = await completePickup(req.body, req.user);
  res.json({ order: orderToClient(order) });
}));

// ---------- QR scan at the counter ----------
// Staff scan the student's personal QR. The response tells the counter, in one glance, what to do. Nothing changes here:
// collecting still goes through POST /pickup/complete (same atomic rules), so a scan alone can never hand food out twice.
r.post('/scan', validate(z.object({ code: z.string().trim().min(5).max(120) }).strict()), asyncHandler(async (req, res) => {
  const parsed = parsePickupCode(req.body.code);
  const o = parsed && await Order.findById(parsed.orderId).populate('student', 'name');
  if (!o || !o.student || !pickupCodeValid({ _id: o._id, student: o.student._id }, parsed.sig)) throw bad('This QR is not a valid TAP & TAKE pickup code', 'QR_INVALID');
  let verdict = 'READY_PAID', message = 'Paid and ready. Hand it over.';
  if (o.status === 'COLLECTED') { verdict = 'ALREADY_COLLECTED'; message = `Already collected at ${o.collectedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Do not serve again.`; }
  else if (o.status === 'CANCELLED') { verdict = 'CANCELLED'; message = 'This order was cancelled.'; }
  else if (o.paymentStatus !== 'PAID') { verdict = 'NOT_PAID'; message = o.paymentMethod === 'CASH_ON_PICKUP' ? `NOT PAID. Collect ₹${o.amountDue} cash, then confirm.` : 'NOT PAID. Online payment is not confirmed yet.'; }
  else if (o.status !== 'READY') { verdict = 'NOT_READY'; message = `Paid, but still ${o.status.toLowerCase()}. Ask them to wait.`; }
  res.json({ verdict, message, canCollect: verdict === 'READY_PAID', canConfirmCash: verdict === 'NOT_PAID' && o.paymentMethod === 'CASH_ON_PICKUP', order: view(o) });
}));

// ---------- prep list ----------
// What to cook today, from the day's orders (cancelled excluded). Paid quantity is certain; unpaid quantity is cash orders not yet confirmed.
r.get('/prep-list', asyncHandler(async (_req, res) => {
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: startOfToday() }, status: { $ne: 'CANCELLED' } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.name',
      ordered: { $sum: '$items.quantity' },
      paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, '$items.quantity', 0] } },
      collected: { $sum: { $cond: [{ $eq: ['$status', 'COLLECTED'] }, '$items.quantity', 0] } },
      orders: { $addToSet: '$_id' },
    } },
    { $project: { _id: 0, name: '$_id', ordered: 1, paid: 1, unpaid: { $subtract: ['$ordered', '$paid'] }, collected: 1, toServe: { $subtract: ['$ordered', '$collected'] }, orders: { $size: '$orders' } } },
    { $sort: { ordered: -1, name: 1 } },
  ]);
  res.json({ items: rows, totals: { ordered: rows.reduce((a, r2) => a + r2.ordered, 0), toServe: rows.reduce((a, r2) => a + r2.toServe, 0) } });
}));

// ---------- payments ----------
r.get('/payments', asyncHandler(async (req, res) => {
  const filter = {};
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status;
  const list = await Payment.find(filter).sort({ createdAt: -1 }).limit(150).populate('order', 'orderNumber status').populate('student', 'name');
  res.json({ payments: list });
}));

// ---------- reports (demand analytics: popular items, daily sales, payment mix) ----------
r.get('/reports', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const from = new Date(Date.now() - days * 86400000);
  const match = { createdAt: { $gte: from }, status: { $ne: 'CANCELLED' } };
  const [daily, top, byStatus, methods] = await Promise.all([
    Order.aggregate([{ $match: { paidAt: { $gte: from }, status: { $ne: 'CANCELLED' }, paymentStatus: 'PAID', paymentMethod: { $ne: 'DEMO' } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, orders: { $sum: 1 }, sales: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: match }, { $unwind: '$items' }, { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } }, { $sort: { quantity: -1 } }, { $limit: 8 }]),
    Order.aggregate([{ $match: { createdAt: { $gte: from } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { createdAt: { $gte: from }, status: 'PAID' } }, { $group: { _id: { method: '$method', isDemo: '$isDemo' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
  ]);
  res.json({ days, daily, topItems: top, ordersByStatus: byStatus, paidByMethod: methods.map((m) => ({ method: m._id.method, isDemo: m._id.isDemo, count: m.count, amount: m.amount })) });
}));

export default r;
