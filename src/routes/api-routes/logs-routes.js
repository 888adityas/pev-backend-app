const express = require("express");
const router = express.Router();

const LogsController = require("../../controllers/backend/LogsController");

// get activity logs
router.get("/activity-logs", LogsController.getActivityLogs);

// get verification logs
router.get("/verification-logs", LogsController.getVerificationLogs);
module.exports = router;
