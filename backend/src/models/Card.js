import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: [true, 'Card number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

cardSchema.index({ number: 1 }, { unique: true });

const Card = mongoose.model('Card', cardSchema);

export default Card;
