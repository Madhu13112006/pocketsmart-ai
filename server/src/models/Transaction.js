import mongoose from 'mongoose';
import { CATEGORY_NAMES } from '../lib/categories.js';

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Stored as YYYY-MM-DD so a month is a simple string range and never shifts with time zones.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    cat: { type: String, required: true, enum: CATEGORY_NAMES },
    amount: { type: Number, required: true, min: 0.01 },
    note: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { timestamps: true },
);

transactionSchema.index({ user: 1, date: -1 });

transactionSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), date: this.date, cat: this.cat, amount: this.amount, note: this.note };
};

export const Transaction = mongoose.model('Transaction', transactionSchema);
