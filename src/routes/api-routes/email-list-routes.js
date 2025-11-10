const express = require("express");
const router = express.Router();

const EmailListController = require("../../controllers/backend/EmailListController");

// Get all email lists route
router.get("/", EmailListController.getAllEmailLists);

// Get email lists card stats and member
router.get("/stats/members", EmailListController.getEmailListCardStats);

// Get all email lists only {_id: 1 , name: 1} route
router.get("/id/name", EmailListController.getAllEmailListsIds);

// Share email list route
router.post("/share", EmailListController.shareEmailList);

// Remove member route
router.post("/remove-member", EmailListController.removeMember);

// Change access type route
router.post("/change-access-type", EmailListController.changeAccessType);

// Remove member route
router.delete("/remove-member", EmailListController.removeMember);

module.exports = router;
