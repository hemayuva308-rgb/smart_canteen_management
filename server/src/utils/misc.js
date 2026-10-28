import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { notFound } from './errors.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function randomCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}
export const randomHex = (n = 16) => crypto.randomBytes(n).toString('hex');
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function maskPhone(p) {
  if (!p) return null;
  const s = String(p);
  return s.length <= 4 ? '****' : `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}
export function oid(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Not found');
  return id;
}
export const timingSafeEqualStr = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
