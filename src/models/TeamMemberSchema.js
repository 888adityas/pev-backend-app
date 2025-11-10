const mongoose = require("mongoose");

const teamMemberSchema = new mongoose.Schema({
  email_lists: [{ type: mongoose.Schema.Types.ObjectId, ref: "EmailList" }],
  sharedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  accessType: { type: String, enum: ["read", "write"], default: "read" },
  sharedOn: { type: Date, default: Date.now },
});

teamMemberSchema.index({ folder: 1, member: 1 }, { unique: true });

/* ---------- 🔹 HELPER ---------- */
teamMemberSchema.methods.getMemberDetails = async function () {
  return this.populate("member", "name email");
};

module.exports = mongoose.model("TeamMember", teamMemberSchema);
