import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    target: { type: Number, required: true, min: 1 },
    saved: { type: Number, default: 0, min: 0 },
    by: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true },
);

goalSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, target: this.target, saved: this.saved, by: this.by };
};

export const Goal = mongoose.model('Goal', goalSchema);
