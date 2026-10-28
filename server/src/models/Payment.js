import mongoose from 'mongoose';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from './Order.js';
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'UNPAID', index: true },
    amount: { type: Number, required: true, min: 0 },
    isDemo: { type: Boolean, default: false }, // true => no real money moved
    demoSession: { type: String, select: false },
    providerOrderId: String,
    providerPaymentId: { type: String, sparse: true, unique: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // admin who confirmed cash
    paidAt: Date,
    failureReason: String,
  },
  { timestamps: true }
);

export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
