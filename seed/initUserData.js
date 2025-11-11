const mongoose = require("mongoose");
const User = require("../src/models/User");

const EmailVerificationSchema = require("../src/models/EmailVerificationSchema");
const Helper = require("../src/utils/Helper");
const axios = require("axios");

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

    // fetch credits from bouncify

    const URL = `${process.env.BASE_URL}/api/v1/email/credit-balance`;
    const [err, response] = await Helper.to(
      axios.get(URL, {
        auth: {
          username: user.api.apiKey,
          password: user.api.secretKey,
        },
      })
    );

    if (err) {
      return reject(Helper.formatAxiosError(err));
    }

    if (!response) {
      throw "Faild to load credits from bouncify ";
    }

    console.log("Crd Res:", response);
    const credits_purchased =
      parseInt(response?.data?.credits_remaining) ?? 100;

    // fetch remaining credits from bouncify

    EmailVerifyPayload = new EmailVerificationSchema({
      source: "credit purchased",
      credits_purchased: 40,
      user: userId, // logged in user id
      summary: "Email Credits Allotted",
    });

    await EmailVerifyPayload.save();

    console.log(`User data initialized`);
    return true;
  } catch (error) {
    console.error("❌ Error initializing user data:", error);
    throw error;
  }
}

module.exports = InitializeUserData;
