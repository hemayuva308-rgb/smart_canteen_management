import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { timingSafeEqualStr } from '../utils/misc.js';

// Pickup QR: "TT1.<orderId>.<signature>". The signature is an HMAC over the order id and the student id, so a code
// cannot be forged or edited. The QR does not grant pickup by itself: staff scan it, the server looks the order up and
// re-checks paid / ready / not-yet-collected. Once collected, the same QR only ever says "already collected".
const PREFIX = 'TT1';
const key = () => crypto.createHash('sha256').update(`pickup-qr:${env.JWT_SECRET}`).digest();
const sign = (orderId, studentId) => crypto.createHmac('sha256', key()).update(`${orderId}:${studentId}`).digest('base64url').slice(0, 22);

export function pickupCodeFor(order) {
  return `${PREFIX}.${order._id}.${sign(order._id, order.student)}`;
}

/** Returns the order id if the code is well-formed and the signature is valid, otherwise null. Signature is checked after the DB read. */
export function parsePickupCode(raw) {
  const parts = String(raw ?? '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  if (!mongoose.isValidObjectId(parts[1]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[2])) return null;
  return { orderId: parts[1], sig: parts[2] };
}

export const pickupCodeValid = (order, sig) => timingSafeEqualStr(sign(order._id, order.student), sig);
