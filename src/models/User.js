const mongoose = require("mongoose");
const Cipher = require("../utils/Cipher");
const Helper = require("../utils/Helper");

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },

    user_id: { type: String, required: true, unique: true },
    role: { type: String, enum: ["owner", "team_member"], default: "owner" },

    api: { type: mongoose.Schema.Types.Mixed, required: true },
    timezone: { type: String, default: "Asia/Kolkata" },
  },
  { timestamps: true }
);

//testing purpose

// Static method to signup the user
userSchema.statics.signUp = function (userId, first_name, last_name, email) {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if user already exists
      var [err, duser] = await Helper.to(this.findOne({ _id: userId }));

      if (err) {
        throw err;
      }

      if (duser) {
        return resolve(duser);
      }

      // Create a new user instance
      const newUser = new this({
        _id: new mongoose.Types.ObjectId(userId),
        user_id: userId, // Store Accounts user_id
        first_name,
        last_name,
        email,
        api: {
          apiKey: Cipher.createSecretKey(10),
          secretKey: Cipher.createSecretKey(16),
        },
      });

      // Save the user to the database
      await newUser.save();

      return resolve(newUser);
    } catch (err) {
      return reject(err);
    }
  });
};

/* ---------- 🔹 VIRTUALS ---------- */

// Folders owned by the user
userSchema.virtual("ownedFolders", {
  ref: "Folder",
  localField: "_id",
  foreignField: "owner",
});

// Folders shared with this user (through TeamMember)
userSchema.virtual("sharedFolders", {
  ref: "TeamMember",
  localField: "_id",
  foreignField: "member",
});

// Automatically include virtuals when converting to JSON / Object
userSchema.set("toObject", { virtuals: true });
userSchema.set("toJSON", { virtuals: true });

/* ---------- 🔹 HELPER FUNCTIONS ---------- */

// Get all folders (owned + shared)
userSchema.methods.getAllAccessibleFolders = async function () {
  const Folder = mongoose.model("Folder");
  const TeamMember = mongoose.model("TeamMember");

  const owned = await Folder.find({ owner: this._id, deletedAt: null });
  const sharedRelations = await TeamMember.find({ member: this._id }).populate(
    "folder"
  );
  const shared = sharedRelations.map((rel) => rel.folder);

  return [...owned, ...shared];
};

// Check if user has write permission on a specific folder
userSchema.methods.hasWriteAccess = async function (folderId) {
  const Folder = mongoose.model("Folder");
  const TeamMember = mongoose.model("TeamMember");

  // Owner always has write access
  const folder = await Folder.findById(folderId);
  if (folder && folder.owner.toString() === this._id.toString()) return true;

  // Otherwise check TeamMember permission
  const relation = await TeamMember.findOne({
    member: this._id,
    folder: folderId,
  });
  return relation && relation.accessType === "write";
};

module.exports = mongoose.model("User", userSchema);
