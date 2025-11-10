const fs = require("fs");
const path = require("path");

/**
 * Cleanup middleware for uploaded files.
 * - Deletes req.file (and req.files[*]) after the response is sent, regardless of success or error.
 * - If an error occurs before response, the global error handler will still trigger 'finish' and cleanup will run.
 *
 * Usage: place this AFTER the upload middleware (e.g. multer) for routes that accept file uploads.
 */
module.exports = function cleanupUpload(req, res, next) {
  // Hook once: when response is finished/closed, dynamically collect and delete files.
  let cleaned = false;

  const addCandidates = () => {
    const paths = new Set();
    const addPath = (p) => {
      if (!p) return;
      try {
        const abs = path.resolve(p);
        paths.add(abs);
      } catch (_) {}
    };

    // Single file
    if (req.file) {
      addPath(req.file.path);
      if (!req.file.path && req.file.destination && req.file.filename) {
        addPath(path.join(req.file.destination, req.file.filename));
      }
      addPath(req.file.tempFilePath);
      addPath(req.file.filepath);
    }

    // Multiple files (array or fields)
    if (Array.isArray(req.files)) {
      req.files.forEach((f) => {
        addPath(f.path);
        if (!f.path && f.destination && f.filename) {
          addPath(path.join(f.destination, f.filename));
        }
        addPath(f.tempFilePath);
        addPath(f.filepath);
      });
    } else if (req.files && typeof req.files === "object") {
      Object.values(req.files)
        .flat()
        .forEach((f) => {
          addPath(f.path);
          if (!f.path && f.destination && f.filename) {
            addPath(path.join(f.destination, f.filename));
          }
          addPath(f.tempFilePath);
          addPath(f.filepath);
        });
    }

    return paths;
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const filePaths = addCandidates();
    for (const p of filePaths) {
      try {
        if (p && fs.existsSync(p)) fs.unlinkSync(p);
      } catch (_) {
        // ignore cleanup errors; temp files are non-critical
      }
    }
  };

  res.on("finish", cleanup); // success or handled error
  res.on("close", cleanup); // connection closed

  // expose a manual trigger for handlers if needed
  res.cleanupUpload = cleanup;

  next();
};
