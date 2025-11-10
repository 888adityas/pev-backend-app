const mongoose = require("mongoose");
const User = require("../src/models/User");

const ActivityLog = require("../src/models/ActivityLog");
const Helper = require("../src/utils/Helper");

/**
 * Initializes base records when a new user signs up
 * - Default folder (Home)
 * - Credit account
 * - Configuration settings
 * - Activity log
 */

// Insert initial data for newly created user
async function InitializeUserData(userId) {
  try {
    if (!userId) throw new Error("User ID is required.");

    // const user = await User.findById(userId);
    const id = new mongoose.Types.ObjectId(userId);
    console.log("id:", id);

    const user = await User.findOne({ _id: userId });

    if (!user) throw new Error("User not found while seeding initial data.");

    // 🧾 Create activity log
    await ActivityLog.create({
      user: user._id,
      action: "user_registered",
      summary: `Account created`,
      createdAt: new Date(),
    });

    console.log(`✅ User data initialized`);
    return true;
  } catch (error) {
    console.error("❌ Error initializing user data:", error);
    throw error;
  }
}

module.exports = InitializeUserData;
