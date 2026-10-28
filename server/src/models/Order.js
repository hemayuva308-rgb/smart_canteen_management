import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];
export const PAYMENT_STATUSES = ['UNPAID', 'PENDING', 'PAID', 'FAILED'];
export const PAYMENT_METHODS = ['ONLINE', 'DEMO', 'CASH_ON_PICKUP'];

// Immutable snapshot of the menu item at order time: later menu edits never change old orders.
const lineSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [lineSchema], validate: (v) => v.length > 0 },
    total: { type: Number, required: true, min: 0 },
    amountDue: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'PLACED' },
    statusHistory: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: 'User' } }],
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'UNPAID' }, // mirrored from Payment by paymentService only
    // Sequential display token (1, 2, 3 ...) per service session. Assigned only once payment is PAID.
    // The six-character pickup code was removed: the internal _id stays the database key, the token is for people.
    tokenNumber: { type: Number, default: null },
    tokenSession: { type: String, default: null },
    tokenAssignedAt: Date,
    tokenClaimAt: Date, // short-lived lock while a token is being allocated (self-heals if the process dies)
    paidAt: Date,
    note: { type: String, trim: true, maxlength: 200, default: '' },
    readyAt: Date,
    collectedAt: Date,
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancelReason: String,
    refundRequired: { type: Boolean, default: false }, // set when a PAID order is cancelled; refunds are manual
  },
  { timestamps: true }
);
orderSchema.index({ student: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ paidAt: -1 });
// Database-level guarantee: a token number can exist only once per service session.
orderSchema.index({ tokenSession: 1, tokenNumber: 1 }, { unique: true, partialFilterExpression: { tokenNumber: { $type: 'number' } } });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
