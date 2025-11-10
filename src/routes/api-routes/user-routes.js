const express = require("express");
const router = express.Router();

const UserController = require("../../controllers/backend/UsersController");

// Get credit statistics route
router.get("/users", UserController.getAll);

module.exports = router;
