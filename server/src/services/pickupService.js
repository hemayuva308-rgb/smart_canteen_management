import { Order } from '../models/Order.js';
import { notFound, conflict } from '../utils/errors.js';
import { audit } from '../models/AuditLog.js';

/**
 * The one and only way an order becomes picked up (COLLECTED). Used by the staff QR-scan screen and the staff pickup desk.
 *
 * Guarantees, all enforced here on the server:
 *  - the order exists, is PAID, has a token and is READY;
 *  - READY -> COLLECTED is a single conditional update, so two requests (refresh, double tap, duplicate scan)
 *    can never both win. The loser gets ALREADY_COLLECTED.
 */
export async function completePickup({ orderId }, actor) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');
  if (order.status === 'COLLECTED') throw conflict('This order was already collected. A QR can be used only once.', 'ALREADY_COLLECTED');
  if (order.status === 'CANCELLED') throw conflict('This order was cancelled', 'ORDER_CANCELLED');
  if (order.paymentStatus !== 'PAID') throw conflict(`Payment is ${order.paymentStatus.toLowerCase()}. It must be paid before pickup.`, 'PAYMENT_NOT_VERIFIED');
  if (order.tokenNumber == null) throw conflict('This order has no token yet', 'NO_TOKEN');
  if (order.status !== 'READY') throw conflict(`Order is ${order.status.toLowerCase()}, not ready for pickup yet`, 'NOT_READY');

  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, status: 'READY', paymentStatus: 'PAID' },
    { $set: { status: 'COLLECTED', collectedAt: new Date(), collectedBy: actor._id }, $push: { statusHistory: { status: 'COLLECTED', by: actor._id } } },
    { new: true }
  );
  if (!claimed) {
    const now = await Order.findById(order._id).select('status');
    throw conflict(now?.status === 'CANCELLED' ? 'This order was cancelled' : 'This order was already collected. A QR can be used only once.', now?.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ALREADY_COLLECTED');
  }
  await audit(actor, 'ORDER_PICKED_UP', order._id, { orderNumber: order.orderNumber, token: order.tokenNumber, session: order.tokenSession, total: order.total, paymentMethod: order.paymentMethod });
  return { order: claimed };
}
