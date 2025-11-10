const { body, param } = require("express-validator");

const checkValueType = (value, datatype) => {
  if (typeof value !== datatype) {
    throw new Error(`Value must be of type ${datatype}`);
  }
  return true;
};

const validateCreateTask = [
  // Title: required, must be string
  body("title")
    .exists({ checkFalsy: true })
    .withMessage("Title is required")
    .custom((value) => checkValueType(value, "string"))
    .trim(),

  // Description: optional string
  body("description")
    .optional()
    .custom((value) => checkValueType(value, "string"))
    .trim(),

  // Priority: optional enum
  body("priority")
    .optional()
    .isIn(["low", "medium", "high"])
    .withMessage("Priority must be one of: low, medium, high"),

  // Start date: optional ISO date
  body("start_date")
    .optional()
    .custom((value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error("Start date must be a valid date");
      }
      return true;
    }),

  // Due date: optional ISO date
  body("due_date")
    .optional()
    .custom((value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error("Due date must be a valid date");
      }
      return true;
    }),

  // Status: optional enum
  body("status")
    .optional()
    .isIn(["pending", "in_progress", "completed"])
    .withMessage("Status must be one of: pending, in_progress, completed"),
];

// Task ID validation for routes like /task/:id
const validateTaskId = [param("id").isMongoId().withMessage("Invalid Task ID")];

module.exports = {
  validateCreateTask,
  validateTaskId,
};
