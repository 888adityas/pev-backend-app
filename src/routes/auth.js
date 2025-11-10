const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/backend/AuthController");
const UsersController = require("../controllers/backend/UsersController");

// Define routes

/**
 * This routes are for only developemnt
 */
if (process.env.ENVIRONMENT === "development") {
  router.post("/signin", AuthController.signin);
  router.post("/signup", AuthController.signup);
}

//Login through token
router.get("/tauth", AuthController.tokenAuth);

//Logout from the current session
router.get("/logout", AuthController.logout);

//verify the current logged in session
router.get("/verify-session", AuthController.verifySession);

// Get user credentials
router.post("/user/credentials", AuthController.userCredentials);

// Update user credentials
router.put("/user/credentials", AuthController.updateUserCredentials);

// Get User Timezone
router.get("/user/timezone", UsersController.getUserTimeZone);

// Update User Timezone
router.post("/user/timezone", UsersController.updateUserTimezone);

module.exports = router;
