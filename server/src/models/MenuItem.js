import mongoose from 'mongoose';
const { Schema } = mongoose;

const menuItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    category: { type: String, required: true, trim: true, maxlength: 40, index: true },
    price: { type: Number, required: true, min: 0, validate: Number.isInteger }, // whole rupees
    imageUrl: { type: String, trim: true, maxlength: 500, default: '' },
    isVeg: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true }, // soft delete keeps order history intact
  },
  { timestamps: true }
);
menuItemSchema.index({ name: 'text', description: 'text' });

export const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);
