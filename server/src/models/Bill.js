import mongoose from 'mongoose';

const billSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    amount: { type: Number, required: true, min: 0.01 },
    day: { type: Number, required: true, min: 1, max: 31 },
  },
  { timestamps: true },
);

billSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, amount: this.amount, day: this.day };
};

export const Bill = mongoose.model('Bill', billSchema);
