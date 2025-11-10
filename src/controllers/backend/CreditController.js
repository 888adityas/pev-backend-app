const Response = require("../../utils/Response");
const Logs = require("../../utils/Logs");
const CreditStats = require("../../models/CreditSchema");
const mongoose = require("mongoose");

// Controller for fetching credit statistics
const getCreditStats = async (req, res, next) => {
  try {
    // convert owner id from request to mongodb ObjectId
    const owner = new mongoose.Types.ObjectId(req.owner);
    Logs.info("Fetching credit stats " + owner);

    // Use mongoose aggregation to get task counts by status
    const stats = await CreditStats.findOne({ owner });

    if (stats.length === 0) {
      Logs.info(`No tasks found for stats: owner: ${owner}`);
      return res.status(200).json(Response.success("No tasks found", []));
    }

    Logs.info(`✅Credit stats fetched successfully for owner: ${owner}`);
    return res
      .status(200)
      .json(Response.success("Task stats fetched successfully", stats));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCreditStats,
};
