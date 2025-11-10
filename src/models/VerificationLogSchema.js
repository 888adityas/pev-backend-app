const mongoose = require("mongoose");

const verificationLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verification_summary: { type: mongoose.Schema.Types.Mixed },
    action_type: { type: String, enum: ["single", "bulk"], required: true },
    credits_used: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VerificationLog", verificationLogSchema);
