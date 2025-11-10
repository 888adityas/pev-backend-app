// /**
//  * Configurations of logger.
//  */
// const { format, createLogger, transports } = require("winston");
// const { combine, timestamp, label, printf, colorize } = format;
// require("winston-daily-rotate-file");

// //Using the printf format.
// const customFormat = printf(
//   ({ level, message, timestamp, meta, ...metadata }) => {
//     return `${level}: ${message} ${
//       meta ? (typeof meta === "object" ? JSON.stringify(meta) : meta) : ""
//     }`;
//   }
// );

// //DailyRotateFile func()
// const fileRotateTransport = new transports.DailyRotateFile({
//   filename: "./logs/%DATE%.log",
//   datePattern: "YYYY-MM-DD",
//   maxFiles: "30d",
//   format: format.combine(timestamp(), format.json()),
// });

// const logger = createLogger({
//   level: "debug",
//   transports: [fileRotateTransport],
// });

// logger.add(
//   new transports.Console({
//     format: format.combine(format.colorize(), format.splat(), customFormat),
//   })
// );

// module.exports = {
//   info: function (message, ...sub) {
//     logger.info(message, { meta: sub && sub.length > 1 ? sub : sub[0] });
//   },
//   error: function (error, ...sub) {
//     let msg = "";

//     if (typeof error !== "object") {
//       error = new Error(error);
//     }

//     if (error?.stack) {
//       msg = `${error.stack}`;
//     } else if (error.message) {
//       msg = error.message;
//     }

//     logger.error(msg, { meta: sub && sub.length > 1 ? sub : sub[0] });
//   },
//   warn: function (message, sub = "") {
//     logger.warn(message, { meta: sub });
//   },
//   debug: function (message, sub = "") {
//     logger.debug(message, { meta: sub });
//   },
//   http: function (message, sub = "") {
//     logger.http(message, { meta: sub });
//   },
//   verbose: function (message, sub = "") {
//     logger.verbose(message, { meta: sub });
//   },
//   silly: function (message, sub = "") {
//     logger.silly(message, { meta: sub });
//   },
// };

/**
 * Configurations of logger.
 */
const { format, createLogger, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;
require("winston-daily-rotate-file");

// Safe JSON stringify (avoids circular references)
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, function (key, value) {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

//Using the printf format.
const customFormat = printf(
  ({ level, message, timestamp, meta, ...metadata }) => {
    let metaStr = "";
    if (meta) {
      if (typeof meta === "object") {
        metaStr = safeStringify(meta);
      } else {
        metaStr = meta;
      }
    }

    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  }
);

//DailyRotateFile func()
const fileRotateTransport = new transports.DailyRotateFile({
  filename: "./logs/%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  format: format.combine(timestamp(), format.json()),
});

const logger = createLogger({
  level: "debug",
  transports: [fileRotateTransport],
});

logger.add(
  new transports.Console({
    format: combine(colorize(), timestamp(), customFormat),
  })
);

module.exports = {
  info: (message, ...sub) => {
    logger.info(message, { meta: sub && sub.length > 1 ? sub : sub[0] });
  },
  error: (error, ...sub) => {
    let msg = "";

    if (typeof error !== "object") {
      error = new Error(error);
    }

    if (error?.stack) {
      msg = error.stack;
    } else if (error.message) {
      msg = error.message;
    }

    logger.error(msg, { meta: sub && sub.length > 1 ? sub : sub[0] });
  },
  warn: (message, sub = "") => {
    logger.warn(message, { meta: sub });
  },
  debug: (message, sub = "") => {
    logger.debug(message, { meta: sub });
  },
  http: (message, sub = "") => {
    logger.http(message, { meta: sub });
  },
  verbose: (message, sub = "") => {
    logger.verbose(message, { meta: sub });
  },
  silly: (message, sub = "") => {
    logger.silly(message, { meta: sub });
  },
};
