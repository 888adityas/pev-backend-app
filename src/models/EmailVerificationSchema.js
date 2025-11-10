const mongoose = require("mongoose");

const emailVerificationSchema = new mongoose.Schema(
  {
    name: { type: String, default: "unknown" },
    email: { type: String, required: true },
    result: { type: String, default: "unknown" },
    source: { type: String, enum: ["single", "bulk"], default: "single" },
    email_list: { type: mongoose.Schema.Types.ObjectId, ref: "EmailList" },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    bulk_verify_id: { type: String, default: null, index: true },
    bouncify_Response: { type: mongoose.Schema.Types.Mixed },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

/* ---------- 🔹 INDEXES ---------- */
emailVerificationSchema.index({ folder: 1 });
emailVerificationSchema.index({ emailList: 1 });
emailVerificationSchema.index({ user: 1 });

module.exports = mongoose.model("EmailVerification", emailVerificationSchema);
