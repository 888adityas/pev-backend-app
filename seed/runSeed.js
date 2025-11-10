// seed/runSeed.js

const mongoose = require("mongoose");
const InitializeUserData = require("./initUserData");
const User = require("../src/models/User");

mongoose.connect("mongodb://127.0.0.1:27017/pabblyemailverification");

(async () => {
  const users = await User.find();

  for (const u of users) {
    await InitializeUserData(u._id);
  }
  console.log("✅ All users initialized");
  mongoose.connection.close();
})();
