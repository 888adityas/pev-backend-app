const mongoose = require("mongoose");
const configSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
  timezone: { type: String, default: "UTC" },
  language: { type: String, default: "en" },
  notifications: { type: Boolean, default: true },
});

/* ---------- 🔹 HELPER ---------- */
configSchema.methods.updateConfig = async function (updates) {
  Object.assign(this, updates);
  await this.save();
};

module.exports = mongoose.model("Configuration", configSchema);
