/**
 * Session Authentication Middleware
 */

const Response = require("../utils/Response");
const ActivityLog = require("../models/ActivityLog");
const Logs = require("../utils/Logs");
const { default: mongoose } = require("mongoose");

module.exports = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    Logs.info("Unauthenticated access attempt to " + req.originalUrl);
    return res.status(400).json(Response.error("Please login first!"));
  }

  if (!req.user) {
    return res.status(401).json(Response.error("Unauthorized!"));
  }

  // Attach owner (user ID) to the request body for further use
  req.owner = req.user.id;

  /**
   * Creating activity log
   */
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    let eventData = req.body;
    if (eventData && eventData.password) {
      delete eventData.password;
    }

    const newActivityLog = new ActivityLog({
      user_id: new mongoose.Types.ObjectId(req.user.id),
      module_name:
        req.routeOptions && req.routeOptions.module_name
          ? req.routeOptions.module_name
          : "",
      event_source: "user",
      action: req.method,
      url: req.originalUrl,
      data: JSON.stringify(eventData),
    });

    // Save the logs to the database
    await newActivityLog.save();
  }

  return next(); // User is authenticated, continue to the next middleware or route handler
};
