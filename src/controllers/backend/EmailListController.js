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

// Note: Make this function in chunks, this is a very large function
const getAllEmailLists = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);

    // Get shared email lists
    const shared = await TeamMember.find({ member: owner }).populate(
      "email_lists"
    );
    const sharedListIds = shared?.flatMap((tm) =>
      tm.email_lists.map((el) => el._id)
    );

    // Query params
    const {
      status,
      search,
      sort_by = "createdAt",
      sort_order,
      page,
      limit = 5,
      skip = 0,
    } = req.query || {};

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const defaultLimit = 10;
    const perPage = Math.max(1, parseInt(limit, 10) || defaultLimit);

    // Base match (used for both filtered data and global summary)
    const baseMatch = {
      $and: [
        { deleted_at: null },
        {
          $or: [{ user: owner }, { _id: { $in: sharedListIds } }],
        },
      ],
    };

    // Create a filtered match (copy baseMatch safely)
    const match = {
      $and: [...baseMatch.$and],
    };

    if (status && status !== "all") {
      match.$and.push({ status: String(status).toLowerCase() });
    }

    if (search) {
      match.$and.push({ name: { $regex: String(search), $options: "i" } });
    }

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

    // -------------------
    // 1️⃣ Aggregation for filtered items (with pagination)
    // -------------------
    const pipeline = [];
    pipeline.push({ $match: match });
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

    // -------------------
    // 2️⃣ Separate aggregation for global status summary (unfiltered)
    // -------------------
    const statusAgg = await EmailList.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
    ]);

    const expectedStatuses = [
      { value: "verified", label: "Verified" },
      { value: "processing", label: "Processing" },
      { value: "uploading", label: "Uploading" },
      { value: "unverified", label: "Unverified" },
    ];

    const statusMap = expectedStatuses.reduce((acc, s) => {
      acc[s.value] = 0;
      return acc;
    }, {});

    (statusAgg || []).forEach(({ status, count }) => {
      if (statusMap.hasOwnProperty(status)) {
        statusMap[status] = count;
      }
    });

    const allCount = Object.values(statusMap).reduce((a, b) => a + b, 0);

    const status_summary = [
      { value: "all", label: "All", count: allCount },
      ...expectedStatuses.map((s) => ({
        value: s.value,
        label: s.label,
        count: statusMap[s.value],
      })),
    ];

    // -------------------
    // Response payload
    // -------------------
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
      status_summary, // ✅ global counts unaffected by filters
    };

    Logs.info("Fetched email lists via aggregation");
    return res
      .status(200)
      .json(Response.success("Email lists fetched", payload));
  } catch (error) {
    Logs.error("Get Email Lists Error:", error.message || error);
    return next(error);
  }
};

const getAllEmailListsIds = async (req, res, next) => {
  try {
    const owner = new mongoose.Types.ObjectId(req.owner);
    const emailLists = await EmailList.find(
      { user: owner, deleted_at: null, status: { $ne: "verified" } },
      { name: 1, status: 1 }
    );
    Logs.info("Fetched email lists");
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

    Logs.info("Email list shared successfully");
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

    Logs.info("Email list card stats fetched successfully");
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
