const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
  totalCredits: { type: Number, default: 0 },
  usedCredits: { type: Number, default: 0 },
  remainingCredits: { type: Number, default: 0 },
  history: [
    {
      action: { type: String, enum: ["purchase", "consume"], required: true },
      amount: { type: Number, required: true },
      date: { type: Date, default: Date.now },
      referenceId: { type: String },
    },
  ],
  updatedAt: { type: Date, default: Date.now },
});

/* ---------- 🔹 HELPER ---------- */
creditSchema.methods.updateCredits = async function (
  action,
  amount,
  refId = null
) {
  if (action === "purchase") {
    this.totalCredits += amount;
    this.remainingCredits += amount;
  } else if (action === "consume") {
    this.usedCredits += amount;
    this.remainingCredits = Math.max(this.remainingCredits - amount, 0);
  }
  this.history.push({ action, amount, referenceId: refId });
  this.updatedAt = new Date();
  await this.save();
};

module.exports = mongoose.model("Credit", creditSchema);
