const express = require("express");
const router = express.Router();

const CreditController = require("../../controllers/backend/CreditController");

// Get credit statistics route
router.get("/stats", CreditController.getCreditStats);

module.exports = router;
