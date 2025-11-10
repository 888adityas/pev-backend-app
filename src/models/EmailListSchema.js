const mongoose = require("mongoose");

const emailListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // List name ex: List 1
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: { type: String, required: true },
    bulk_verify: { type: Boolean, default: false },
    bulk_verify_id: { type: String, index: true },
    total_emails: { type: Number, default: 0 },
    credit_consumed: { type: Number, default: 0 },
    verified_count: { type: Number, default: 0 },

    deliverable: { type: Number, default: 0 },
    undeliverable: { type: Number, default: 0 },
    accept_all: { type: Number, default: 0 },
    unknown: { type: Number, default: 0 },

    deleted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

/* ---------- 🔹 VIRTUALS ---------- */
emailListSchema.virtual("emailVerifications", {
  ref: "EmailVerification",
  localField: "_id",
  foreignField: "emailList",
});
emailListSchema.set("toObject", { virtuals: true });
emailListSchema.set("toJSON", { virtuals: true });

/* ---------- 🔹 CASCADE ---------- */
emailListSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    const EmailVerification = mongoose.model("EmailVerification");
    await EmailVerification.deleteMany({ emailList: this._id });
    next();
  }
);

/* ---------- 🔹 HELPER ---------- */
// Helper to count verified emails
emailListSchema.methods.countVerified = async function () {
  const EmailVerification = mongoose.model("EmailVerification");
  return EmailVerification.countDocuments({
    emailList: this._id,
    status: "valid",
  });
};

module.exports = mongoose.model("EmailList", emailListSchema);
