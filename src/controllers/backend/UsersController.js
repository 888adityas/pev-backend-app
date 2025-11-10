const User = require("../../models/User");
const Logs = require("../../utils/Logs");
const Response = require("../../utils/Response");
const Helper = require("../../utils/Helper");
const { validationResult, param, body } = require("express-validator");
const { default: mongoose } = require("mongoose");

module.exports = {
  /**
   * Create user
   * @param {*} req
   * @param {*} res
   */
  create: async (req, res) => {
    try {
      if (!req.body.user_id) {
        throw "User id is required";
      }

      const user = await User.signUp(req.body.user_id);
      res.send(Response.success("User created successfully", user));
    } catch (err) {
      Logs.error(err);
      res
        .status(500)
        .json(
          Response.error(
            "Some error occurred while creating the User.",
            err.message
          )
        );
    }
  },

  /**
   * This method is use for retrieve a single record.
   * @param {*} req
   * @param {*} res
   * @returns User
   */
  getOne: async (req, res) => {
    try {
      // Define your validation rules here
      const validationRules = [
        param("user_id", "Invalid user ID").custom(Helper.isValidObjectId),
      ];

      // Run the validation rules
      await Promise.all(
        validationRules.map(async (rule) => await rule.run(req))
      );

      // Get validation errors
      const errors = validationResult(req);

      // Check for validation errors
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(Response.error("Fields are required.", errors.array()[0]));
      }

      const userId = req.params.user_id;

      const user = await User.findById(userId);

      if (!user) {
        throw "User not found!";
      }

      return res.json(Response.success("Get User", user));
    } catch (err) {
      Logs.error(err);
      res.status(400).json(Response.error(err));
    }
  },

  /**
   * This method is use to update the single record.
   * @param {*} req
   * @param {*} res
   * @returns User
   */
  updateOne: async (req, res) => {
    try {
      // Define your validation rules here
      const validationRules = [
        param("user_id", "Invalid user ID")
          .notEmpty()
          .custom(Helper.isValidObjectId),
        body("username").optional().escape(),
        body("email")
          .optional()
          .isEmail()
          .withMessage("Invalid email address")
          .escape(),
        body("password")
          .optional()
          .isLength({ min: 6 })
          .withMessage("Password must be at least 6 characters"),
      ];

      // Run the validation rules
      await Promise.all(
        validationRules.map(async (rule) => await rule.run(req))
      );

      // Get validation errors
      const errors = validationResult(req);

      // Check for validation errors
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(Response.error("Fields are required.", errors.array()[0]));
      }

      const userId = req.params.user_id;

      const { username, email, password } = req.body;

      if (!username && !email && !password) {
        throw "Atleast one of the field is required username, email or password.";
      }

      let updateFields = {};

      if (email) {
        // Check if the provided email already exists
        let existingUser = await User.findOne({ _id: { $ne: userId }, email });
        if (existingUser) {
          throw "User with this email already exists";
        }

        updateFields.email = email;
      }

      if (username) {
        updateFields.username = username;
      }

      if (password) {
        updateFields.password = password;
      }

      const updatedUser = await User.findByIdAndUpdate(userId, updateFields, {
        new: true,
      });

      if (!updatedUser) {
        throw "User not found!";
      }

      return res.json(
        Response.success("User updated successfully", updatedUser)
      );
    } catch (err) {
      Logs.error(err);
      res.status(500).json(Response.error(err));
    }
  },

  /**
   * This method is use to fetch all the user record.
   * @param {*} req
   * @param {*} res
   * @returns User
   */
  getAll: async (req, res) => {
    try {
      const owner = new mongoose.Types.ObjectId(req.owner);
      const Users = await User.find({ _id: { $ne: owner } }).sort({
        createdAt: -1,
      });
      return res.json(Response.success("All User", Users));
    } catch (err) {
      Logs.error(err);
      res.status(500).json(Response.error(err));
    }
  },
  getUserByEmail: async (req, res) => {
    const { email } = req.body;
    Logs.debug(email);
    try {
      const user = await User.findOne({ email });
      return res.json(Response.success("User by email", user));
    } catch (err) {
      Logs.error(err);
      res.status(500).json(Response.error(err.message || err));
    }
  },

  /**
   * This method is use to delete a single record.
   * @param {*} req
   * @param {*} res
   * @returns User
   */

  deleteOne: async (req, res) => {
    try {
      // Define your validation rules here
      const validationRules = [
        param("user_id", "Invalid user ID").custom(Helper.isValidObjectId),
      ];

      // Run the validation rules
      await Promise.all(
        validationRules.map(async (rule) => await rule.run(req))
      );

      // Get validation errors
      const errors = validationResult(req);

      // Check for validation errors
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(Response.error("Fields are required.", errors.array()[0]));
      }

      const userId = req.params.user_id;

      const deletedUser = await User.findByIdAndDelete(userId);

      if (!deletedUser) {
        throw "User not found!";
      }

      // Destroy the current session
      req.session.destroy((err) => {
        if (err) {
          Logs.error(err);
        }
      });

      return res.json(Response.success("Get User", deletedUser));
    } catch (err) {
      Logs.error(err);
      res.status(500).json(Response.error(err));
    }
  },
  getUserTimeZone: async (req, res, next) => {
    try {
      if (req.session && req.user) {
        const { id } = req.user;

        const user = await User.findOne({ _id: id });

        if (!user) {
          throw "No user found!";
        }

        return res
          .status(200)
          .json(Response.success("User time zone", user.timezone));
      } else {
        return res
          .status(401)
          .json(Response.error("Invalid ID, No user found"));
      }
    } catch (error) {
      Logs.error(error);
      return res.status(400).json({ error: error.message });
    }
  },

  updateUserTimezone: async (req, res, next) => {
    try {
      if (req.session && req.user) {
        const { id } = req.user;

        const user = await User.findOne({ _id: id });

        if (!user) {
          throw "No user found!";
        }

        user.timezone = req.body.timezone;
        await user.save();

        return res
          .status(200)
          .json(Response.success("User time zone updated", user));
      } else {
        return res
          .status(401)
          .json(Response.error("Invalid ID, No user found"));
      }
    } catch (error) {
      Logs.error(error);
      return res.status(400).json({ error: error.message });
    }
  },
};
