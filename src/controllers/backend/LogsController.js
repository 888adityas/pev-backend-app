const Response = require("../../utils/Response");
const Logs = require("../../utils/Logs");
const ActivityLog = require("../../models/ActivityLog");
const VerificationLog = require("../../models/EmailVerificationSchema");
const mongoose = require("mongoose");

/**
 * Get all activity logs for the authenticated user.
 *
 * Query Parameters
 * -------------------------------------------------------------------------
 * | Param         | Meaning                                                   |
 * |---------------|-----------------------------------------------------------|
 * | `action`      | Filter by specific action type                            |
 * | `search`      | Search in `summary` or `action` (case-insensitive)        |
 * | `min_credits` | Include logs with ≥ this many credits used                |
 * | `max_credits` | Include logs with ≤ this many credits used                |
 * | `sort_by`     | Sort by: action, credits_used, createdAt, etc.            |
 * | `sort_order`  | asc or desc (default: desc)                               |
 * | `page`        | Page number (default: 1)                                  |
 * | `limit`       | Results per page (default: 10)                            |
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);

    // Extract query params
    const {
      startDate,
      endDate,
      action,
      email,
      source,
      search,
      sort_by = "createdAt",
      sort_order = "desc",
      page = 1,
      limit = 10,
      skip = 0,
    } = req.query || {};

    const pageNum = Math.max(1, parseInt(page, 10));
    const perPage = Math.max(1, parseInt(limit, 10));

    /** --------------------------------------------
     * Build Match Conditions
     * -------------------------------------------- */
    const match = { user_id: owner };

    // Filter by action (POST | PUT | DELETE)
    if (action && ["POST", "PUT", "DELETE"].includes(action.toUpperCase())) {
      match.action = action.toUpperCase();
    }

    // Filter by event source (API | USER)
    if (source && ["API", "USER"].includes(source.toUpperCase())) {
      match.event_source = source.toLowerCase(); // your DB stores "api" | "user"
    }

    // Filter by date range
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      match.createdAt = dateFilter;
    }

    // Keyword search inside data, url, or module_name
    if (search) {
      match.$or = [
        { data: { $regex: String(search), $options: "i" } },
        { url: { $regex: String(search), $options: "i" } },
        { module_name: { $regex: String(search), $options: "i" } },
      ];
    }

    // Optional email search inside `data`
    if (email) {
      match.data = { $regex: String(email), $options: "i" };
    }

    /** --------------------------------------------
     * Sorting
     * -------------------------------------------- */
    const allowedSort = new Set(["action", "createdAt", "updatedAt", "url"]);
    const sortKey = allowedSort.has(String(sort_by))
      ? String(sort_by)
      : "createdAt";
    const sortOrder = String(sort_order).toLowerCase() === "asc" ? 1 : -1;

    /** --------------------------------------------
     * Aggregation Pipeline
     * -------------------------------------------- */
    const pipeline = [];

    // 1️⃣ Match user and filters
    pipeline.push({ $match: match });

    // 2️⃣ Populate user details
    pipeline.push({
      $lookup: {
        from: "users", // your MongoDB users collection
        localField: "user_id",
        foreignField: "_id",
        as: "user",
      },
    });

    // 3️⃣ Unwind user array
    pipeline.push({
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    });

    // 4️⃣ Sort results
    pipeline.push({ $sort: { [sortKey]: sortOrder, _id: -1 } });

    // 5️⃣ Facet: items and total count
    pipeline.push({
      $facet: {
        items: [
          { $skip: parseInt(skip) },
          { $limit: perPage },
          {
            $project: {
              _id: 1,
              module_name: 1,
              event_source: 1,
              action: 1,
              url: 1,
              data: 1,
              createdAt: 1,
              user: {
                _id: "$user._id",
                name: { $concat: ["$user.first_name", " ", "$user.last_name"] },
                email: "$user.email",
              },
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    });

    /** --------------------------------------------
     * Execute
     * -------------------------------------------- */
    const agg = await ActivityLog.aggregate(pipeline);
    const items = agg?.[0]?.items || [];
    const total_count = agg?.[0]?.totalCount?.[0]?.count || 0;

    /** --------------------------------------------
     * Response Payload
     * -------------------------------------------- */
    const payload = {
      items,
      pagination: {
        total_count,
        page: pageNum,
        limit: perPage,
        pages: Math.ceil(total_count / perPage),
        sort_by: sortKey,
        sort_order: sortOrder === 1 ? "asc" : "desc",
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        action: action || null,
        email: email || null,
        source: source || null,
        search: search || null,
      },
    };

    Logs.info("✅ Activity logs fetched successfully (with user populated)");
    return res
      .status(200)
      .json(Response.success("Activity logs fetched", payload));
  } catch (error) {
    Logs.error("❌ Get Activity Logs Error:", error.message || error);
    return next(error);
  }
};

const getVerificationLogs = async (req, res, next) => {
  try {
    // Convert owner safely
    let ownerId;
    try {
      ownerId = new mongoose.Types.ObjectId(req.owner);
    } catch {
      ownerId = req.owner; // fallback if not valid ObjectId
    }

    // Extract query params
    const {
      status,
      source,
      search,
      sort_by = "createdAt",
      sort_order = "desc",
      page = 1,
      limit = 5,
      skip = 0,
    } = req.query || {};

    const pageNum = Math.max(1, parseInt(page, 10));
    const perPage = Math.max(1, parseInt(limit, 10));

    /** --------------------------------------------
     * Build MongoDB Match Filter
     * -------------------------------------------- */
    const match = {
      deleted_at: null,
    };

    // We’ll handle user ID robustly with $expr to ensure type match
    const userMatch = {
      $expr: {
        $eq: [{ $toString: "$user" }, String(ownerId)],
      },
    };

    const orFilters = [];

    // Match both data.result and top-level result
    if (status && String(status).toLowerCase() !== "all") {
      orFilters.push(
        { "data.result": String(status) },
        { result: String(status) }
      );
    }

    // Filter by source if provided
    if (source) match.source = String(source);

    // Text search filter
    if (search) {
      orFilters.push(
        { summary: { $regex: String(search), $options: "i" } },
        { "data.email": { $regex: String(search), $options: "i" } },
        { email: { $regex: String(search), $options: "i" } }
      );
    }

    if (orFilters.length) match.$or = orFilters;

    const allowedSort = new Set([
      "source",
      "summary",
      "credits",
      "createdAt",
      "updatedAt",
      "result",
    ]);
    const sortKey = allowedSort.has(String(sort_by))
      ? String(sort_by)
      : "createdAt";
    const sortOrder = String(sort_order).toLowerCase() === "asc" ? 1 : -1;

    /** --------------------------------------------
     * Aggregation Pipeline
     * -------------------------------------------- */
    const pipeline = [];

    // Add user match with $expr
    pipeline.push({ $match: userMatch });

    // Normal match (deleted_at, source, search, etc.)
    pipeline.push({ $match: match });

    // Compute UI-friendly fields
    pipeline.push({
      $addFields: {
        computed_summary: {
          $cond: [
            { $eq: ["$source", "single"] },
            { $ifNull: ["$data.email", "$email"] },
            { $ifNull: ["$summary", "$email"] },
          ],
        },
        computed_credits: {
          $cond: [
            {
              $and: [
                { $ifNull: ["$credits_used", false] },
                { $gt: ["$credits_used", 0] },
              ],
            },
            { $multiply: ["$credits_used", -1] },
            { $ifNull: ["$credits_purchased", 0] },
          ],
        },
        computed_result: { $ifNull: ["$data.result", "$result"] },
      },
    });

    // Sort
    pipeline.push({
      $sort: {
        [sortKey === "credits" ? "computed_credits" : sortKey]: sortOrder,
        _id: -1,
      },
    });

    // Project only the fields needed by UI
    pipeline.push({
      $project: {
        _id: 1,
        email: 1,
        source: 1,
        result: "$computed_result",
        summary: "$computed_summary",
        credits: "$computed_credits",
        createdAt: 1,
        updatedAt: 1,
        data: 1,
      },
    });

    // Facet for pagination + total count
    pipeline.push({
      $facet: {
        items: [{ $skip: parseInt(skip) }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
      },
    });

    // Run aggregation
    const agg = await VerificationLog.aggregate(pipeline);
    const items = agg?.[0]?.items || [];
    const total_count = agg?.[0]?.totalCount?.[0]?.count || 0;

    /** --------------------------------------------
     * Prepare Response
     * -------------------------------------------- */
    const payload = {
      items,
      pagination: {
        total_count,
        page: pageNum,
        limit: perPage,
        pages: Math.ceil(total_count / perPage),
        sort_by: sortKey,
        sort_order: sortOrder === 1 ? "asc" : "desc",
      },
    };

    Logs.info("✅ Verification logs fetched successfully", {
      count: items.length,
    });
    return res
      .status(200)
      .json(Response.success("Verification logs fetched", payload));
  } catch (error) {
    Logs.error("❌ Get Verification Logs Error:", error.message || error);
    return next(error);
  }
};

module.exports = {
  getActivityLogs,
  getVerificationLogs,
};
