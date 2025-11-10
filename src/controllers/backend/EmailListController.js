const Response = require("../../utils/Response");
const Logs = require("../../utils/Logs");
const ActivityLog = require("../../models/ActivityLog");
const mongoose = require("mongoose");
const EmailList = require("../../models/EmailListSchema");
const TeamMember = require("../../models/TeamMemberSchema");

/**
 * Get all email lists (bulk email list)
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */

/** 
 * Functionality Overview
 * 
| Query Param    | Meaning                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `status`       | Filter by status (e.g., `"verified"`, `"unverified"`, `"processing"`, etc.) |
| `search`       | Search by email list name (case-insensitive)                                            |
| `min_verified` | Only include lists with **at least** this many verified emails               |
| `max_verified` | Only include lists with **at most** this many verified emails                |
| `min_total`    | Only include lists with **at least** this many total emails                  |
| `max_total`    | Only include lists with **at most** this many total emails                   |
| `sort_by`      | Sort by a field (`name`, `status`, `createdAt`, etc.)                       |
| `sort_order`   | `asc` or `desc`                                                              |
| `page`         | For pagination (which page number to show)                                   |
| `limit`        | How many items per page                                                      |
*/
const getAllEmailLists = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);
    // const TeamMember = mongoose.model("TeamMember");

    // Get shared email lists
    const shared = await TeamMember.find({ member: owner }).populate(
      "email_lists"
    );

    const sharedListIds = shared?.flatMap((tm) =>
      tm.email_lists.map((el) => el._id)
    );

    // Query params for filters, sorting, pagination
    const {
      status, // filter by status
      search, // case-insensitive name search
      min_verified, // verified_count >=
      max_verified, // verified_count <=
      min_total, // total_emails >=
      max_total, // total_emails <=
      sort_by = "createdAt", // allowed: name, status, createdAt, verified_count, total_emails, credit_consumed
      sort_order, // asc|desc (default desc)
      page, // 1-based
      limit, // default 10 if not provided
      skip = 0,
    } = req.query || {};

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const defaultLimit = 10;
    const perPage = Math.max(1, parseInt(limit, 10) || defaultLimit);

    // Build match stage
    const match = {
      $and: [
        { deleted_at: null },
        {
          $or: [
            { user: owner }, // owned lists
            { _id: { $in: sharedListIds } }, // shared lists
          ],
        },
      ],
    };
    if (status) match.status = String(status).toLowerCase();
    if (search) match.name = { $regex: String(search), $options: "i" };

    const toNum = (v) => (v === undefined ? undefined : Number(v));
    const _minVerified = toNum(min_verified);
    const _maxVerified = toNum(max_verified);
    const _minTotal = toNum(min_total);
    const _maxTotal = toNum(max_total);

    const allowedSort = new Set([
      "name",
      "status",
      "createdAt",
      "verified_count",
      "total_emails",
      "credit_consumed",
    ]);
    const sortKey = allowedSort.has(String(sort_by))
      ? String(sort_by)
      : "createdAt";
    const sortOrder = String(sort_order).toLowerCase() === "desc" ? -1 : 1;

    const pipeline = [];
    pipeline.push({ $match: match });

    const rangeExprs = [];
    if (Number.isFinite(_minVerified))
      rangeExprs.push({ $gte: ["$verified_count", _minVerified] });
    if (Number.isFinite(_maxVerified))
      rangeExprs.push({ $lte: ["$verified_count", _maxVerified] });
    if (Number.isFinite(_minTotal))
      rangeExprs.push({ $gte: ["$total_emails", _minTotal] });
    if (Number.isFinite(_maxTotal))
      rangeExprs.push({ $lte: ["$total_emails", _maxTotal] });
    if (rangeExprs.length)
      pipeline.push({ $match: { $expr: { $and: rangeExprs } } });

    pipeline.push({ $sort: { [sortKey]: sortOrder, _id: -1 } });

    pipeline.push({
      $facet: {
        items: [{ $skip: parseInt(skip) }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
      },
    });

    const agg = await EmailList.aggregate(pipeline);
    const items = agg?.[0]?.items || [];
    const total_count = agg?.[0]?.totalCount?.[0]?.count || 0;

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
        status: status || null,
        search: search || null,
        min_verified: _minVerified ?? null,
        max_verified: _maxVerified ?? null,
        min_total: _minTotal ?? null,
        max_total: _maxTotal ?? null,
      },
    };

    Logs.info("✅Fetched email lists via aggregation");
    return res
      .status(200)
      .json(Response.success("Email lists fetched", payload));
  } catch (error) {
    Logs.error("Get Email Lists Error:", error.message || error);
    return next(error);
  }
};

// Get all email lists extract only _id and name of the email list
// this data we'll need for select dropdown
const getAllEmailListsIds = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);
    const emailLists = await EmailList.find(
      { user: owner, deleted_at: null, status: { $ne: "verified" } },
      { name: 1, status: 1 }
    );
    Logs.info("✅Fetched email lists");
    return res
      .status(200)
      .json(Response.success("Email lists fetched", emailLists));
  } catch (error) {
    Logs.error("Get Email Lists Error:", error.message || error);
    return next(error);
  }
};

const shareEmailList = async (req, res, next) => {
  try {
    const { memberId, emailListIds, accessType: access_type_str } = req.body;
    let accessType;
    if (access_type_str?.toLowerCase()?.includes("read")) {
      accessType = "read";
    } else {
      accessType = "write";
    }

    const owner = new mongoose.Types.ObjectId(req.owner);
    if (!memberId)
      return res.status(400).json(Response.error("Member ID is required"));
    if (!emailListIds)
      return res
        .status(400)
        .json(Response.error("Email list IDs are required"));

    let teamMember = await TeamMember.findOne({
      sharedBy: owner,
      member: memberId,
    });

    if (!teamMember) {
      teamMember = new TeamMember({
        sharedBy: owner,
        member: memberId,
        accessType: accessType || "read",
        email_lists: emailListIds,
      });
    } else {
      //  Append new email list IDs without losing old ones
      const existingIds = teamMember.email_lists.map(String);
      const newIds = Array.isArray(emailListIds)
        ? emailListIds
        : [emailListIds];

      // Add only IDs that don't already exist
      const merged = [
        ...existingIds,
        ...newIds.filter((id) => !existingIds.includes(String(id))),
      ];

      teamMember.email_lists = merged;
      teamMember.accessType = accessType || teamMember.accessType;
    }

    await teamMember.save();

    Logs.debug("teamMember:", teamMember);

    Logs.info("✅Email list shared successfully");
    return res
      .status(200)
      .json(Response.success("Email list shared successfully", teamMember));
  } catch (error) {
    console.error(error);
    return next(error);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const { memberId } = req.body;
    if (!memberId)
      return res.status(400).json(Response.error("Member ID is required"));

    const owner = new mongoose.Types.ObjectId(req.owner);
    const teamMember = await TeamMember.deleteOne({
      sharedBy: owner,
      member: memberId,
    });

    Logs.debug("teamMember:", teamMember);
    return res
      .status(200)
      .json(Response.success("Mmember removed successfully", teamMember));
  } catch (error) {
    return next(error);
  }
};

const changeAccessType = async (req, res, next) => {
  try {
    const { memberId, accessType: access_type_str } = req.body;
    let accessType;
    if (access_type_str?.toLowerCase()?.includes("read")) {
      accessType = "read";
    } else {
      accessType = "write";
    }

    const owner = new mongoose.Types.ObjectId(req.owner);
    const teamMember = await TeamMember.findOneAndUpdate(
      { sharedBy: owner, member: memberId },
      { accessType },
      { new: true }
    );
    return res
      .status(200)
      .json(Response.success("Access type changed successfully", teamMember));
  } catch (error) {
    return next(error);
  }
};

// Get email list card stats
// ( team members added by you,
// email lists shared by you ,
// email lists shared with you )
const getEmailListCardStats = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);

    const stats = await TeamMember.aggregate([
      {
        $facet: {
          // 1️⃣ Email lists shared BY you
          emailListsSharedByYou: [
            { $match: { sharedBy: owner } },
            { $unwind: "$email_lists" },
            {
              $group: {
                _id: null,
                uniqueEmailLists: { $addToSet: "$email_lists" },
              },
            },
            { $project: { count: { $size: "$uniqueEmailLists" } } },
          ],

          // 2️⃣ Email lists shared WITH you
          emailListsSharedWithYou: [
            { $match: { member: owner } },
            { $unwind: "$email_lists" },
            {
              $group: {
                _id: null,
                uniqueEmailLists: { $addToSet: "$email_lists" },
              },
            },
            { $project: { count: { $size: "$uniqueEmailLists" } } },
          ],

          // 3️⃣ Members added by you (distinct member IDs)
          membersAddedByYou: [
            { $match: { sharedBy: owner } },
            { $group: { _id: null, uniqueMembers: { $addToSet: "$member" } } },
            { $project: { count: { $size: "$uniqueMembers" } } },
          ],

          // 4️⃣ Optional: Fetch all member documents you shared with (for UI)
          membersList: [
            { $match: { sharedBy: owner } },
            {
              $lookup: {
                from: "users",
                localField: "member",
                foreignField: "_id",
                as: "memberDetails",
              },
            },
            { $unwind: "$memberDetails" },
            {
              $project: {
                _id: 1,
                accessType: 1,
                sharedOn: 1,
                "memberDetails._id": 1,
                "memberDetails.name": 1,
                "memberDetails.email": 1,
                totalLists: { $size: "$email_lists" },
              },
            },
          ],
        },
      },
      {
        // Flatten output for easier consumption
        $project: {
          emailListsSharedByYou: {
            $ifNull: [{ $arrayElemAt: ["$emailListsSharedByYou.count", 0] }, 0],
          },
          emailListsSharedWithYou: {
            $ifNull: [
              { $arrayElemAt: ["$emailListsSharedWithYou.count", 0] },
              0,
            ],
          },
          membersAddedByYou: {
            $ifNull: [{ $arrayElemAt: ["$membersAddedByYou.count", 0] }, 0],
          },
          membersList: 1,
        },
      },
    ]);

    Logs.info("✅Email list card stats fetched successfully");
    return res
      .status(200)
      .json(
        Response.success("Email list card stats fetched successfully", stats)
      );
  } catch (error) {
    console.error(error);
    return next(error);
  }
};

module.exports = {
  getAllEmailLists,
  shareEmailList,
  getAllEmailListsIds,
  getEmailListCardStats,
  removeMember,
  changeAccessType,
};
