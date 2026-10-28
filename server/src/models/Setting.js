import mongoose from 'mongoose';
const { Schema } = mongoose;

const settingSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    // Token numbering restarts at 1 for each service session. By default a new session starts every day;
    // staff can also start one manually (e.g. lunch service). Existing tokens are never renumbered.
    autoDailySession: { type: Boolean, default: true },
    serviceSession: { id: { type: String, default: null }, label: { type: String, default: '' }, startedAt: Date },
  },
  { timestamps: true }
);

export const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

export async function getSettings() {
  return Setting.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}
