import mongoose from 'mongoose';
const { Schema } = mongoose;

// Append-only trail of money, token and pickup events. Actor is empty for system actions (e.g. provider webhooks).
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorType: { type: String, enum: ['STUDENT', 'ADMIN', 'SYSTEM'], default: 'SYSTEM' },
    action: { type: String, required: true, index: true },
    subject: { type: String, index: true },
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne']) {
  auditSchema.pre(op, function () {
    throw new Error('Audit records are immutable');
  });
}
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);

/** Never throws: an audit write failure must not roll back an already-completed business action, but it is logged loudly. */
export async function audit(actor, action, subject, meta) {
  try {
    await AuditLog.create({ actor: actor?._id, actorType: actor?.role || 'SYSTEM', action, subject: subject ? String(subject) : undefined, meta });
  } catch (e) {
    console.error('[audit] FAILED to write', action, subject, e.message);
  }
}
