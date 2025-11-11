const mongoose = require("mongoose");

const emailVerificationSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    email: { type: String },
    credits_used: { type: Number, default: 0 },
    credits_purchased: { type: Number, default: null },
    summary: { type: String },
    result: { type: String, default: null },
    source: {
      type: String,
      enum: ["single", "bulk", "credit purchased"],
      default: "single",
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    data: { type: mongoose.Schema.Types.Mixed },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

/* ---------- 🔹 INDEXES ---------- */
emailVerificationSchema.index({ folder: 1 });
emailVerificationSchema.index({ emailList: 1 });
emailVerificationSchema.index({ user: 1 });

module.exports = mongoose.model("EmailVerification", emailVerificationSchema);
