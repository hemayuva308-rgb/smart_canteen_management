import mongoose from 'mongoose';
const { Schema } = mongoose;

// Atomic sequence generator. One document per sequence, e.g. "token:2026-10-25-S1".
const counterSchema = new Schema({ _id: { type: String }, seq: { type: Number, default: 0 } }, { versionKey: false });

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/** Atomically returns the next number. Retries once if two callers race to create the counter. */
export async function nextSeq(id) {
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await Counter.findOneAndUpdate({ _id: id }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return c.seq;
    } catch (e) {
      if (e.code !== 11000 || attempt >= 3) throw e;
    }
  }
}
