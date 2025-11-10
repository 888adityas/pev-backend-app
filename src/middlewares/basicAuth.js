/**
 * Basic Authentication Middleware
 */

const Response = require("../utils/Response");
const ActivityLog = require("../models/ActivityLog");
const passport = require("passport");
const Logs = require("../utils/Logs");

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
