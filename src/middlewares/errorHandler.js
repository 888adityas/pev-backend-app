const Response = require("../utils/Response");
const Logs = require("../utils/Logs");

const errorHandler = (err, req, res, next) => {
  // Only Handle if there is an error
  if (!err) next(); // If not exists, pass to next middleware

  const { method, originalUrl } = req;

  // Log the error with context
  Logs.error(`[${method} ${originalUrl}] - ${err.message}`);

  // Set default status code and message if not set
  if (!res.headersSent) {
    res.status(err.status || 500);
  }

  return res.json(Response.error(err.message || "Internal Server Error"));
};

module.exports = errorHandler;
