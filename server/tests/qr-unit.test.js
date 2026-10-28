import './setupEnv.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { pickupCodeFor, parsePickupCode, pickupCodeValid } from '../src/services/qrService.js';

const order = () => ({ _id: new mongoose.Types.ObjectId(), student: new mongoose.Types.ObjectId() });

test('QR code round-trips and is bound to the order and student', () => {
  const o = order();
  const p = parsePickupCode(pickupCodeFor(o));
  assert.equal(p.orderId, String(o._id));
  assert.equal(pickupCodeValid(o, p.sig), true);
  assert.equal(pickupCodeValid({ ...o, student: new mongoose.Types.ObjectId() }, p.sig), false);
});

test('edited, swapped or malformed QR codes are rejected', () => {
  const a = order(), b = order();
  const pa = parsePickupCode(pickupCodeFor(a));
  assert.equal(pickupCodeValid(b, pa.sig), false); // signature from another order
  for (const bad of ['', 'TT1', 'TT1.abc.def', `XX.${a._id}.${pa.sig}`, `TT1.${a._id}.${pa.sig}.x`, `TT1.${a._id}.short`, null, undefined]) {
    assert.equal(parsePickupCode(bad), null, String(bad));
  }
});
