const Response = require("../../utils/Response");
const Logs = require("../../utils/Logs");
const ActivityLog = require("../../models/ActivityLog");
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
      action,
      search,
      min_credits,
      max_credits,
      sort_by = "createdAt",
      sort_order = "desc",
      page = 1,
      limit = 10,
      skip = 0,
    } = req.query || {};

    const pageNum = Math.max(1, parseInt(page, 10));
    const perPage = Math.max(1, parseInt(limit, 10));

    /** --------------------------------------------
     * Build MongoDB Aggregation Pipeline
     * -------------------------------------------- */
    const match = { user: owner };

    if (action) match.action = String(action);
    if (search) {
      match.$or = [
        { summary: { $regex: String(search), $options: "i" } },
        { action: { $regex: String(search), $options: "i" } },
      ];
    }

    const toNum = (v) => (v === undefined ? undefined : Number(v));
    const _minCredits = toNum(min_credits);
    const _maxCredits = toNum(max_credits);

    const allowedSort = new Set([
      "action",
      "summary",
      "credits_used",
      "createdAt",
      "updatedAt",
    ]);
    const sortKey = allowedSort.has(String(sort_by))
      ? String(sort_by)
      : "createdAt";
    const sortOrder = String(sort_order).toLowerCase() === "asc" ? 1 : -1;

    const pipeline = [];

    // Match Stage
    pipeline.push({ $match: match });

    // Range Filters
    const rangeExprs = [];
    if (Number.isFinite(_minCredits))
      rangeExprs.push({ $gte: ["$credits_used", _minCredits] });
    if (Number.isFinite(_maxCredits))
      rangeExprs.push({ $lte: ["$credits_used", _maxCredits] });
    if (rangeExprs.length)
      pipeline.push({ $match: { $expr: { $and: rangeExprs } } });

    // Sort
    pipeline.push({ $sort: { [sortKey]: sortOrder, _id: -1 } });

    // Facet for Pagination + Count
    pipeline.push({
      $facet: {
        items: [{ $skip: parseInt(skip) }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
      },
    });

    // Run Aggregation
    const agg = await ActivityLog.aggregate(pipeline);
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
      filters: {
        action: action || null,
        search: search || null,
        min_credits: _minCredits ?? null,
        max_credits: _maxCredits ?? null,
      },
    };

    Logs.info("✅ Activity logs fetched successfully");
    return res
      .status(200)
      .json(Response.success("Activity logs fetched", payload));
  } catch (error) {
    Logs.error("❌ Get Activity Logs Error:", error.message || error);
    return next(error);
  }
};

module.exports = {
  getActivityLogs,
};
