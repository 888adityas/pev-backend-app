const Response = require("../../utils/Response");
const Logs = require("../../utils/Logs");
const ActivityLog = require("../../models/ActivityLog");
const mongoose = require("mongoose");
const { default: axios } = require("axios");
const fs = require("fs");
const path = require("path");
const EmailVerificationSchema = require("../../models/EmailVerificationSchema");
const EmailList = require("../../models/EmailListSchema");
const TeamMember = require("../../models/TeamMemberSchema");

/**
 * Resolve the "real owner" of an EmailList for a given user.
 * @param {ObjectId} emailListId - The EmailList _id
 * @param {ObjectId} actingUserId - The logged-in user's _id
 * @returns {Object} { ownerId, canWrite } - ownerId (User A), canWrite (true/false)
 */
async function resolveEmailListOwnership(emailListId, actingUserId) {
  const EmailList = mongoose.model("EmailList");
  const list = await EmailList.findById(emailListId);

  if (!list) throw new Error("Email list not found");

  // Case 1: user owns this list
  if (list.user.toString() === actingUserId.toString()) {
    return { owner: list.user, canWrite: true };
  }

  // Case 2: check if it's shared
  const relation = await TeamMember.findOne({
    member: actingUserId,
    email_lists: list._id,
  }).populate("sharedBy");

  if (!relation) throw new Error("Permission denied: Not shared with you");

  if (relation.accessType !== "write") {
    throw new Error("Permission denied: Read-only access");
  }

  // Return the original owner (sharedBy)
  return { owner: relation.sharedBy._id, canWrite: true };
}

/**
 * Controllers for email verification
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
const singleVerifyEmail = async (req, res, next) => {
  const owner = new mongoose.Types.ObjectId(req.owner);

  // Destruct email and check is it exists
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const apiEndpoint = process.env.BOUNCIFY_API_ENDPOINT;
  const apiKey = process.env.BOUNCIFY_API_KEY;

  const URL = `${apiEndpoint}?apikey=${apiKey}&email=${email}`;

  //   return res.status(200).json({ success: true });

  try {
    const response = await axios.get(URL, {
      headers: {
        Accept: "application/json",
      },
    });

    // Response data
    Logs.info(`✅Single Email Verified Successfully`);

    // Save api response to database
    let EmailVerifyPayload;
    if (response?.data) {
      EmailVerifyPayload = new EmailVerificationSchema({
        email: response.data.email,
        credits_used: 1,
        result: response.data.result,
        summary: "Email Address",
        source: "single",
        user: owner, // logged in user id
        data: response?.data,
      });

      await EmailVerifyPayload.save();
    }

    return res
      .status(200)
      .json(
        Response.success(
          "✅Single Email Verified Successfully",
          EmailVerifyPayload
        )
      );
  } catch (error) {
    // If Bouncify Error Occur
    if (error.response) {
      Logs.error("Bouncify Error:", error);
      next(error);
    } else {
      Logs.error("Network/Error:", error.message);
      next(error);
    }
  }
};

// upload bulk emails via CSV data
// expects multipart/form-data with field name "file"
const bulkUploadEmails = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);
    console.log("owner: ", owner);
    console.log("req.owner:", req.owner);
    console.log("DB_USER:", "69084bd28c1e504520034e0c");

    // // testing purposes
    // return res.status(200).json({ owner });

    const { name } = req.body;

    const apiKey = process.env.BOUNCIFY_API_KEY;
    const bulkEndpoint =
      process.env.BOUNCIFY_BULK_ENDPOINT || "https://api.bouncify.io/v1/bulk";

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "CSV file is required in 'file' field" });
    }

    const filePath =
      req.file.path ||
      req.file.tempFilePath ||
      req.file.filepath ||
      (req.file.destination
        ? path.join(req.file.destination, req.file.filename)
        : null);
    const resolvedPath = fs.existsSync(req.file.path || "")
      ? req.file.path
      : filePath;

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res
        .status(400)
        .json({ error: "Uploaded file not found on server" });
    }

    // estimate total emails from CSV (minus header)
    let totalEmails = 0;
    try {
      const content = fs.readFileSync(resolvedPath, "utf8");
      const lines = content.split(/\r?\n/).filter(Boolean);
      totalEmails = Math.max(0, lines.length - 1);
    } catch (_) {}

    const form = new (require("form-data"))();
    form.append("local_file", fs.createReadStream(resolvedPath), {
      filename: path.basename(resolvedPath),
      contentType: "text/csv",
    });

    const url = `${bulkEndpoint}?apikey=${apiKey}`;
    Logs.info("url: ", url);

    // testing purposes
    // return res.status(200).json({ filePath, totalEmails, url });

    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Accept: "application/json",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const bData = response.data || {};

    // persist list
    const emailList = new EmailList({
      name: name || path.basename(resolvedPath),
      user: owner,
      status: "unverified",
      bulk_verify: true,
      bulk_verify_id: bData.job_id || bData.jobId || bData.id || null,
      total_emails: totalEmails || bData.total_emails || 0,
      credit_consumed: 0,
      verified_count: 0,
    });
    await emailList.save();

    Logs.info("✅Bulk list uploaded to Bouncify and saved to DB");
    return res
      .status(200)
      .json(
        Response.success("Bulk list uploaded", { bouncify: bData, emailList })
      );
  } catch (error) {
    if (error.response) {
      Logs.error(
        "Bouncify Error:",
        error.response.data || error.response.statusText
      );
    } else {
      Logs.error("Network/Error:", error.message);
    }
    next(error);
  }
};

// start verifying bulk emails via job_id
// expects JSON body { jobId: "..." }
// this operation requires write access
const startBulkVerification = async (req, res, next) => {
  try {
    const actingUser = new mongoose.Types.ObjectId(req.owner);
    const { jobId, listId } = req.body;
    if (!jobId && !listId)
      return res.status(400).json({ error: "jobId or listId is required" });

    // 🧠 Step 1: Find the actual owner
    const { owner, canWrite } = await resolveEmailListOwnership(
      listId,
      actingUser
    );
    console.log("owner: ", owner);
    console.log("canWrite: ", canWrite);

    if (!canWrite) return res.status(403).json({ error: "Permission denied" });

    let resolvedJobId = jobId;
    let emailList = null;
    if (!resolvedJobId && listId) {
      emailList = await EmailList.findOne({ _id: listId, user: owner });
      if (!emailList)
        return res.status(404).json({ error: "Email list not found" });
      resolvedJobId = emailList.bulk_verify_id;
      if (!resolvedJobId)
        return res
          .status(400)
          .json({ error: "No jobId associated with this list" });
    }

    const apiKey = process.env.BOUNCIFY_API_KEY;
    const bulkEndpoint =
      process.env.BOUNCIFY_BULK_ENDPOINT || "https://api.bouncify.io/v1/bulk";
    const url = `${bulkEndpoint}/${encodeURIComponent(
      resolvedJobId
    )}?apikey=${apiKey}`;

    const response = await axios.patch(
      url,
      { action: "start" },
      { headers: { Accept: "application/json" } }
    );

    if (!emailList) {
      emailList = await EmailList.findOne({
        bulk_verify_id: resolvedJobId,
        user: owner,
      });
    }
    if (emailList) {
      emailList.status = "processing";
      emailList.credit_consumed = emailList.total_emails;
      await emailList.save();
    }

    EmailVerifyPayload = new EmailVerificationSchema({
      credits_used: emailList.credit_consumed,
      source: "bulk",
      summary: "Bulk verification started",
      user: owner, // logged in user id
      data: JSON.stringify(req.body),
    });

    await EmailVerifyPayload.save();

    Logs.info("✅Bulk verification started");
    return res.status(200).json(
      Response.success("Bulk verification started", {
        bouncify: response.data,
        emailList,
      })
    );
  } catch (error) {
    if (error.response) {
      Logs.error(
        "Bouncify Error:",
        error.response.data.result ||
          error.response.data ||
          error.response.statusText
      );
    } else {
      Logs.error("Network/Error:", error.message);
    }
    next(error);
  }
};

// Check job status of a bulk email list
// expects query ?jobId=...
// this operation requires write access
const getBulkJobStatus = async (req, res, next) => {
  try {
    const jobId = req.query.jobId || req.params.jobId || req.body.jobId;
    const listId = req.query.listId || req.params.listId || req.body.listId;
    if (!jobId && !listId)
      return res.status(400).json({ error: "jobId or listId is required" });

    // Find the actual owner
    const actingUser = new mongoose.Types.ObjectId(req.owner);
    const { owner, canWrite } = await resolveEmailListOwnership(
      listId,
      actingUser
    );
    if (!canWrite) return res.status(403).json({ error: "Permission denied" });

    const apiKey = process.env.BOUNCIFY_API_KEY;
    const bulkEndpoint =
      process.env.BOUNCIFY_BULK_ENDPOINT || "https://api.bouncify.io/v1/bulk";
    const url = `${bulkEndpoint}/${encodeURIComponent(jobId)}?apikey=${apiKey}`;

    const response = await axios.get(url, {
      headers: { Accept: "application/json" },
    });

    const data = response.data || {}; // bouncify data
    const statusFromAPI =
      data.status === "completed" ? "verified" : data.status;
    const verifiedCount = data.verified || data.processed || 0;
    const total = data.total || data.total_emails || undefined;

    const emailList = await EmailList.findOne({
      bulk_verify_id: jobId,
      user: owner,
    });
    if (emailList) {
      if (statusFromAPI) emailList.status = String(statusFromAPI).toLowerCase();
      if (typeof verifiedCount === "number")
        emailList.verified_count = verifiedCount;
      if (typeof total === "number" && !emailList.total_emails) {
        emailList.total_emails = total;
      }

      emailList.deliverable = data.results?.deliverable;
      emailList.undeliverable = data.results?.undeliverable;
      emailList.accept_all = data.results?.accept_all;
      emailList.unknown = data.results?.unknown;

      emailList.credit_consumed = total;
      emailList.updatedAt = data.created_at;

      await emailList.save();
    }

    Logs.info("✅Fetched bulk job status");
    return res.status(200).json(
      Response.success("Bulk job status fetched", {
        bouncify: data,
        emailList,
      })
    );
  } catch (error) {
    if (error.response) {
      Logs.error(
        "Bouncify Error:",
        error.response.data || error.response.statusText
      );
    } else {
      Logs.error("Network/Error:", error.message);
    }
    next(error);
  }
};

// Download the result of bulk email list
// expects query ?jobId=...
const downloadBulkResult = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);
    const jobId = req.query.jobId || req.params.jobId || req.body.jobId;
    if (!jobId) return res.status(400).json({ error: "jobId is required" });

    const apiKey = process.env.BOUNCIFY_API_KEY;

    const downloadEndpoint =
      process.env.BOUNCIFY_DOWNLOAD_ENDPOINT ||
      "https://api.bouncify.io/v1/download";

    // Get filter type from query/body
    // e.g. ?filter=deliverable or ?filter=undeliverable or ?filter=all
    const filter = req.query.filter || req.body.filter;
    // Map filters to Bouncify accepted result types
    let filterResult = [
      "deliverable",
      "undeliverable",
      "accept_all",
      "unknown",
    ]; // default
    if (filter === "deliverable") filterResult = ["deliverable"];
    else if (filter === "undeliverable") filterResult = ["undeliverable"];
    else if (filter === "accept_all") filterResult = ["accept_all"];
    else if (filter === "unknown") filterResult = ["unknown"];

    const url = `${downloadEndpoint}?jobId=${encodeURIComponent(
      jobId
    )}&apikey=${apiKey}`;

    // Bouncify requires POST to send filter body
    const response = await axios.post(
      url,
      { filterResult },
      { responseType: "arraybuffer" }
    );

    Logs.info("✅Downloaded bulk job result");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=bouncify_${jobId}.csv`
    );
    res.setHeader("Content-Type", "text/csv");

    return res.status(200).send(Buffer.from(response.data));
  } catch (error) {
    if (error.response) {
      Logs.error(
        "Bouncify Error:",
        error.response.data.result || error.response.statusText
      );
    } else {
      Logs.error("Network/Error:", error.message);
    }
    next(error.response.data.result || error.response.statusText);
  }
};

// Delete a bulk email list
// expects JSON body { jobId: "..." } or query ?jobId=...
// this operation requires write access
const deleteBulkList = async (req, res, next) => {
  try {
    const jobId = req.body.jobId || req.query.jobId || req.params.jobId;
    let listId = req.body.listId || req.query.listId || req.params.listId;

    if (!jobId && !listId) {
      return res.status(400).json({ error: "jobId or listId is required" });
    }

    // Find the actual owner
    const actingUser = new mongoose.Types.ObjectId(req.owner);
    const { owner, canWrite } = await resolveEmailListOwnership(
      listId,
      actingUser
    );

    if (!canWrite) return res.status(403).json({ error: "Permission denied" });

    let resolvedJobId = jobId;
    let emailList = null;
    if (listId) {
      listId = new mongoose.Types.ObjectId(listId);
      emailList = await EmailList.findOne({ _id: listId, user: owner });
      if (!emailList)
        return res.status(404).json({ error: "Email list not found" });
      resolvedJobId = resolvedJobId || emailList.bulk_verify_id;
    }
    if (!resolvedJobId)
      return res
        .status(400)
        .json({ error: "jobId not found for provided list" });

    const apiKey = process.env.BOUNCIFY_API_KEY;
    const bulkEndpoint =
      process.env.BOUNCIFY_BULK_ENDPOINT || "https://api.bouncify.io/v1/bulk";
    const url = `${bulkEndpoint}/${encodeURIComponent(
      resolvedJobId
    )}?apikey=${apiKey}`;

    const response = await axios.delete(url, {
      headers: { Accept: "application/json" },
    });

    if (!emailList) {
      emailList = await EmailList.findOne({
        bulk_verify_id: resolvedJobId,
        user: owner,
      });
    }
    if (emailList) {
      emailList.deleted_at = new Date();
      await emailList.save();
    }

    Logs.info("✅Bulk list deleted");
    return res.status(200).json(
      Response.success("Bulk list deleted", {
        bouncify: response.data,
        emailList,
      })
    );
  } catch (error) {
    if (error.response) {
      Logs.error(
        "Bouncify Error:",
        error.response.data || error.response.statusText
      );
    } else {
      Logs.error("Network/Error:", error.message);
    }
    next(error);
  }
};

// Get Bouncify credit balance
// const getBouncifyCredits = async (req, res, next) => {
//   try {
//     const apiKey = process.env.BOUNCIFY_API_KEY;
//     const infoEndpoint =
//       process.env.BOUNCIFY_INFO_ENDPOINT || "https://api.bouncify.io/v1/info";
//     const url = `${infoEndpoint}?apikey=${apiKey}`;

//     // 1) Fetch remaining credits from Bouncify
//     const response = await axios.get(url, {
//       headers: { Accept: "application/json" },
//     });
//     const data = response?.data || {};
//     const creditsRemaining = data?.credits_info?.credits_remaining ?? null;

//     // 2) Compute consumed credits for this owner
//     const owner = new mongoose.Types.ObjectId(req.owner);

//     // 2.a) Count single verifications (each costs 1 credit)
//     const singleCount = await EmailVerificationSchema.countDocuments({
//       user: owner,
//     });

//     // 2.b) Sum bulk list credit_consumed and count total lists
//     const listAgg = await EmailList.aggregate([
//       { $match: { user: owner } },
//       {
//         $group: {
//           _id: null,
//           total_credit_consumed: { $sum: { $ifNull: ["$credit_consumed", 0] } },
//           total_lists: { $sum: 1 },
//         },
//       },
//     ]);

//     const creditsFromLists = listAgg[0]?.total_credit_consumed || 0;
//     const totalLists = listAgg[0]?.total_lists || 0;

//     const creditsConsumed = singleCount + creditsFromLists;

//     const normalized = {
//       success: data.success ?? true,
//       credits_remaining: creditsRemaining,
//       credits_consumed: creditsConsumed,
//       total_count_of_email_lists: totalLists,
//     };

//     return res
//       .status(200)
//       .json(Response.success("Bouncify credit balance fetched", normalized));
//   } catch (error) {
//     if (error.response) {
//       Logs.error(
//         "Bouncify Error:",
//         error.response.data || error.response.statusText
//       );
//     } else {
//       Logs.error("Network/Error:", error.message);
//     }
//     next(error);
//   }
// };

const getBouncifyCredits = async (req, res, next) => {
  try {
    const apiKey = process.env.BOUNCIFY_API_KEY;
    const infoEndpoint =
      process.env.BOUNCIFY_INFO_ENDPOINT || "https://api.bouncify.io/v1/info";
    const url = `${infoEndpoint}?apikey=${apiKey}`;

    // --------------------------------------------
    // 1️⃣ Fetch remaining credits from Bouncify API
    // --------------------------------------------
    const response = await axios.get(url, {
      headers: { Accept: "application/json" },
    });

    const data = response?.data || {};
    const creditsRemaining = data?.credits_info?.credits_remaining ?? 0;

    // --------------------------------------------
    // 2️⃣ Compute consumed & purchased credits locally
    // --------------------------------------------
    const owner = new mongoose.Types.ObjectId(req.owner);

    // Aggregate total credits used & purchased (from EmailVerificationSchema)
    const creditAgg = await EmailVerificationSchema.aggregate([
      { $match: { user: owner, deleted_at: null } },
      {
        $group: {
          _id: null,
          total_credits_used: { $sum: { $ifNull: ["$credits_used", 0] } },
          total_credits_purchased: {
            $sum: { $ifNull: ["$credits_purchased", 0] },
          },
        },
      },
    ]);

    const creditsUsed = creditAgg?.[0]?.total_credits_used || 0;
    const creditsPurchased = creditAgg?.[0]?.total_credits_purchased || 0;

    // --------------------------------------------
    // 3️⃣ Get total number of email lists (from EmailList)
    // --------------------------------------------
    const totalEmailLists = await EmailList.countDocuments({
      user: owner,
      deleted_at: null,
    });

    // --------------------------------------------
    // 4️⃣ Normalize for frontend response
    // --------------------------------------------
    const normalized = {
      success: data.success ?? true,
      credits_remaining: creditsRemaining,
      credits_consumed: creditsUsed, // ✅ from EmailVerificationSchema only
      credits_purchased: creditsPurchased,
      total_count_of_email_lists: totalEmailLists,
    };

    Logs.info("✅ Bouncify credit balance fetched successfully");

    return res
      .status(200)
      .json(Response.success("Bouncify credit balance fetched", normalized));
  } catch (error) {
    // --------------------------------------------
    // 5️⃣ Error handling
    // --------------------------------------------
    if (error.response) {
      Logs.error(
        "❌ Bouncify API Error:",
        error.response.data || error.response.statusText
      );
    } else {
      Logs.error("❌ Network/Error:", error.message);
    }

    return next(error);
  }
};

module.exports = {
  singleVerifyEmail,
  bulkUploadEmails,
  startBulkVerification,
  getBulkJobStatus,
  downloadBulkResult,
  deleteBulkList,
  getBouncifyCredits,
};
