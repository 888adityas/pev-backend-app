const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// Multer storage config: store in tmp/uploads with original filename
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), "tmp", "uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// CSV file filter
const fileFilter = (req, file, cb) => {
  const allowed = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/csv",
    "text/plain",
  ];
  if (allowed.includes(file.mimetype) || file.originalname.endsWith(".csv")) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  }, // 10MB
});

const EmailVerifyController = require("../../controllers/backend/EmailVerifyController");

// Verify single email
router.post("/single/verify", EmailVerifyController.singleVerifyEmail);

// Bulk verification routes--------------------------------------------------
// Upload a bulk email list
router.post(
  "/bulk/upload",
  upload.single("file"),
  EmailVerifyController.bulkUploadEmails
);

// Start verifying bulk email list using Bouncify API
router.patch("/bulk/start", EmailVerifyController.startBulkVerification);

// Check job status of a bulk email list
router.get("/bulk/status", EmailVerifyController.getBulkJobStatus);

// Download result of a bulk email list
router.post("/bulk/download", EmailVerifyController.downloadBulkResult);

// Get Bouncify credit balance
router.get("/credit-balance", EmailVerifyController.getBouncifyCredits);

// Delete a bulk email list
router.delete("/bulk", EmailVerifyController.deleteBulkList);

module.exports = router;
