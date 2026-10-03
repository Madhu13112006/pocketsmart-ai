import mongoose from 'mongoose';
import { DEFAULT_CAPS } from '../lib/categories.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    currency: { type: String, enum: ['inr', 'usd', 'eur', 'gbp'], default: 'inr' },
    income: { type: Number, default: 0, min: 0 },
    payday: { type: Number, default: 1, min: 1, max: 31 },
    caps: { type: Map, of: Number, default: () => ({ ...DEFAULT_CAPS }) },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    currency: this.currency,
    income: this.income,
    payday: this.payday,
    caps: Object.fromEntries(this.caps ?? []),
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
