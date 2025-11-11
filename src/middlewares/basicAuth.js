/**
 * Basic Authentication Middleware
 */

const Response = require("../utils/Response");
const ActivityLog = require("../models/ActivityLog");
const passport = require("passport");
const Logs = require("../utils/Logs");
const { default: mongoose } = require("mongoose");

module.exports = async (req, res, next) => {
  passport.authenticate(
    "basic",
    { session: false },
    async (err, user, info) => {
      try {
        if (err) {
          throw err;
        }

        if (!user) {
          console.log("User in basicAuth:", user);
          throw "Invalid access!!";
        }

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
            event_source: "api",
            action: req.method,
            url: req.originalUrl,
            data: JSON.stringify(eventData),
          });
          await newActivityLog.save();
        }

        req.user = user;
        req.owner = req.user.id;
        return next(); // User is authenticated, continue to the next middleware or route handler
      } catch (err) {
        Logs.error(err);
        res.status(401).json(Response.error(err));
      }
    }
  )(req, res); // Pass req and res to the authenticate function
};
