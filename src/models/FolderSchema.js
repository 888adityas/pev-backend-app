const mongoose = require("mongoose");

const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  isDefault: { type: Boolean, default: false },
  emailLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "EmailList" }],
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "TeamMember" }],
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

/* ---------- 🔹 VIRTUALS ---------- */

// All verifications (through lists)
folderSchema.virtual("emailVerifications", {
  ref: "EmailVerification",
  localField: "_id",
  foreignField: "folder",
});

folderSchema.set("toObject", { virtuals: true });
folderSchema.set("toJSON", { virtuals: true });

/* ---------- 🔹 CASCADE ---------- */
folderSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    const folderId = this._id;
    const EmailList = mongoose.model("EmailList");
    const TeamMember = mongoose.model("TeamMember");
    await EmailList.deleteMany({ folder: folderId });
    await TeamMember.deleteMany({ folder: folderId });
    next();
  }
);

/* ---------- 🔹 HELPER ---------- */

// Populate full folder structure: lists + verifications
folderSchema.methods.populateFull = async function () {
  return this.populate({
    path: "emailLists",
    populate: {
      path: "emailVerifications",
    },
  });
};

module.exports = mongoose.model("Folder", folderSchema);
