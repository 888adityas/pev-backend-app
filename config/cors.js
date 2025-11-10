const cors = require("cors");
// Env-driven allow list. Example:
// ALLOWED_ORIGINS=http://localhost:3000,http://localhost:1337,https://app.pabbly.com
// ROOT_DOMAIN=pabbly.com (allows any subdomain under this domain)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const rootDomain = (process.env.ROOT_DOMAIN || "").trim();

function isAllowedOrigin(origin) {
  try {
    const u = new URL(origin);
    const originNormalized = `${u.protocol}//${u.host}`; // host includes hostname:port if present

    // 1) Exact match
    if (allowedOrigins.includes(originNormalized)) return true;

    // 2) Root domain wildcard support
    if (rootDomain) {
      const host = u.hostname; // no port here
      if (host === rootDomain) return true;
      if (host.endsWith(`.${rootDomain}`)) return true;
    }

    // 3) Sensible localhost defaults if not provided by env
    const localhostDefaults = [
      "http://localhost:3000",
      "http://localhost:1337",
      "http://localhost:3031",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:1337",
    ];
    if (localhostDefaults.includes(originNormalized)) return true;

    return false;
  } catch (_) {
    return false;
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, server-to-server, SSR)
    if (!origin) {
      return callback(null, true);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    const error = new Error("Not allowed by CORS");
    error.status = 403;
    return callback(error, false);
  },
  methods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  allowedHeaders:
    "Content-Type, Content-Length, Accept-Encoding, X-Requested-With, Authorization, X-API-KEY",
  exposedHeaders: "Content-Disposition", // for file downloads
  optionsSuccessStatus: 200,
  // Some legacy browsers choke on 204
  credentials: true,
};

const corsMiddleware = cors(corsOptions);

module.exports = corsMiddleware;
