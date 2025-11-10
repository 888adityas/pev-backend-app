const express = require("express");
const router = express.Router();
const ApiController = require("../controllers/api/ApiController");

router.get("/sample", ApiController.sample);

// Import routes
const creditRoutes = require("./api-routes/credit-routes");
const verifyEmailRoutes = require("./api-routes/verify-email-routes");
const emailListRoutes = require("./api-routes/email-list-routes");
const logsRoutes = require("./api-routes/logs-routes");

// Define routes

router.use("/credits", creditRoutes);

// Verify-email routes
router.use("/email", verifyEmailRoutes);

// Email List Routes
router.use("/email-lists", emailListRoutes);

// Logs Routes
router.use("/logs", logsRoutes);

module.exports = router;
