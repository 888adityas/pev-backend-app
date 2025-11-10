const express = require("express");
const app = express();
require("dotenv").config();
const dbConfig = require("./config/database");
const setupMongoSession = require("./config/sessionMongo");
const corsMiddleware = require("./config/cors");
const helmetMiddleware = require("./config/helmet");
const cacheControl = require("./config/cacheControl");
const passport = require("passport");
require("./config/passport");
const cookieParser = require("cookie-parser");
const compression = require("compression");

/**
 * Use the custom CORS middleware
 */
app.use(corsMiddleware);

/**
 * Use the custom Helmet middleware
 */
app.use(helmetMiddleware);

/**
 * Use the custom Cache Control middleware
 */
app.use(cacheControl);

/**
 * Compresses response bodies for all requests to improve performance.
 */
app.use(compression());

/**
 * if you run behind a proxy (e.g. nginx, cloudflare)
 * app.set('trust proxy', 1);
 */

/**
 * Middleware for parsing cookies
 */
app.use(cookieParser());
/**
 * Parse request json
 */
app.use(express.json());

/**
 * Parses incoming requests with URL-encoded payloads
 */
app.use(express.urlencoded({ extended: true }));

/**
 * Use the Mongo session middleware
 */
app.use(setupMongoSession());

/**
 * Initialize Passport middleware
 */
app.use(passport.initialize());
app.use(passport.session());

/**
 *  Import load routes module
 */
const loadRoutes = require("./config/routes");
const errorHandler = require("./src/middlewares/errorHandler");
const cleanupUpload = require("./src/middlewares/cleanupUpload");

/**
 * Automatically load and bind routes
 */
// Register cleanupUpload early so any route using file uploads benefits.
// It is safe to keep global as it only operates if req.file/req.files exist.
app.use(cleanupUpload);
loadRoutes(app);

/**
 * Custom Error Handling
 */
app.use(errorHandler);

const port = process.env.PORT || 3000;

//Check database connection and initialize the server
async function startServer() {
  try {
    await dbConfig.connection.once("open", () => {
      console.log(
        "Connection to the MongoDB database has been established successfully."
      );
    });

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
}

startServer();
