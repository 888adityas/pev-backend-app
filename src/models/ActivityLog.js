const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    module_name: { type: String },
    event_source: { type: String },
    action: { type: String, required: true },
    url: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

const ActivityLogs = mongoose.model("ActivityLog", activitySchema);

module.exports = ActivityLogs;

// const activityLogSchema = new mongoose.Schema(
//   {
//     user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     action: {
//       type: String,
//       enum: [
//         "single_verification",
//         "bulk_verification",
//         "credit_purchase",
//         "folder_created",
//         "folder_deleted",
//         "team_member_added",
//         "team_member_removed",
//         "config_updated",
//         "user_registered",
//         // Extended actions for verification workflow and credits
//         "bulk_upload",
//         "bulk_start",
//         "bulk_status_checked",
//         "bulk_result_downloaded",
//         "bulk_list_deleted",
//         "credits_fetched",
//       ],
//       required: true,
//     },
//     summary: { type: String },
//     credits_used: { type: Number, default: 0 },
//     data: { type: mongoose.Schema.Types.Mixed },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("ActivityLog", activityLogSchema);
