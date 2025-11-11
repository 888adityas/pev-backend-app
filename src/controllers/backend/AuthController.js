const { validationResult, body } = require("express-validator");
const User = require("../../models/User.js");
const Logs = require("../../utils/Logs");
const Helper = require("../../utils/Helper");
const Response = require("../../utils/Response");
const Accounts = require("../../utils/Accounts");
const InitializeUserData = require("../../../seed/initUserData.js");
const Cipher = require("../../utils/Cipher");
const { default: mongoose } = require("mongoose");

module.exports = {
  /**
   * This is use to login the user.
   * Only for the development
   * @param {*} req
   * @param {*} res
   */
  signin: async (req, res) => {
    try {
      const { email, password } = req.body;

      //Call signin api
      var [err, signIn] = await Helper.to(
        Accounts.singIn({
          email,
          password,
        })
      );

      if (err) {
        throw err;
      }

      if (signIn.status === "error") {
        throw signIn.message;
      }

      const user =
        signIn.data && signIn.data.customer ? signIn.data.customer : null;
      const token = signIn.data && signIn.data.token ? signIn.data.token : null;

      if (!user) {
        throw "No user found!";
      }

      //Signup user if not exist.
      var [err, newUser] = await Helper.to(User.signUp(user.id));
      req.logIn(user, function (err) {
        if (err) {
          Logs.error(err);
          res.status(400).json(Response.error(err));
        }

        return res.send(Response.success("Logged in successfully"));
      });
    } catch (err) {
      Logs.error(err);
      res.status(400).json(Response.error(err));
    }
  },

  /**
   * This is use to register the user.
   * Only for the development
   * @param {*} req
   * @param {*} res
   */

  signup: async (req, res) => {
    try {
      // Define your validation rules here
      const validationRules = [
        body("first_name", "First name is required").notEmpty().escape(),
        body("last_name", "Last name is required").notEmpty().escape(),
        body("email")
          .notEmpty()
          .withMessage("Email is required")
          .isEmail()
          .withMessage("Not a valid email")
          .escape(),
        body("password")
          .notEmpty()
          .withMessage("Password is required")
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

      // If validation passes, you can access validated data in req.body
      const { first_name, last_name, password } = req.body;
      const email = req.body.email?.toLowerCase();

      //Call signup api
      var [err, signUp] = await Helper.to(
        Accounts.signUp({
          first_name,
          last_name,
          email,
          password,
          project: process.env.PROJECT_NAME,
        })
      );

      // signUp.status === "success"
      // User is created in Accounts

      if (err) {
        throw err;
      }

      if (signUp.status === "error") {
        throw signUp.message;
      }

      //Call signin api
      var [err, signIn] = await Helper.to(
        Accounts.singIn({
          email,
          password,
        })
      );

      Logs.info("signIn Response: ", signIn);

      if (err) {
        Logs.error("signIn err: ", signIn);
        throw err;
      }

      if (signIn.status === "error") {
        throw signIn.message;
      }

      const user =
        signIn.data && signIn.data.customer ? signIn.data.customer : null;
      const token = signIn.data && signIn.data.token ? signIn.data.token : null;

      if (!user) {
        throw "No user found!";
      }

      //Signup user if not exist.
      var [err, newUser] = await Helper.to(
        User.signUp(user.id, first_name, last_name, email)
      );

      if (newUser) {
        // Initialize all base collections
        await InitializeUserData(newUser._id);
      }

      req.logIn(user, function (err) {
        if (err) {
          Logs.error(err);
          res.status(400).json(Response.error(err));
        }

        // Respond with success message and created user data
        return res
          .status(201)
          .json(Response.success("User created successfully", token));
      });
    } catch (err) {
      Logs.error(err);
      res.status(400).json(Response.error(err));
    }
  },

  /**
   * This is use to logout the user.
   * @param {*} req
   * @param {*} res
   */

  logout: async (req, res) => {
    try {
      req.logout((err) => {
        if (err) {
          Logs.error(err);
          res.status(400).json(Response.error(err));
        }

        req.session.destroy();
        return res.send(Response.success("Logged out successfully"));
      });
    } catch (err) {
      Logs.error(err);
      res.status(400).json(Response.error(err));
    }
  },

  /**
   * Token authentication to login user in the production.
   * @param {*} req
   * @param {*} res
   */

  tokenAuth: async function (req, res) {
    try {
      Logs.info("Token login");
      var token = req.query.token;

      if (!token) {
        throw "Token code is required";
      }

      //Call tokenAuth api
      var [err, response] = await Helper.to(Accounts.tokenAuth(token));

      if (err) {
        throw err;
      }

      if (response.status !== "success") {
        return res.redirect(process.env.ACCOUNT_BASE_URL);
      }

      const user = response.data;

      var [err, duser] = await Helper.to(User.findOne({ user_id: user.id }));

      if (err) {
        throw err;
      }

      //Signup user if not exist.
      var [err, newUser] = await Helper.to(User.signUp(user.id));

      req.logIn(user, function (err) {
        if (err) {
          Logs.error(err);
          res.status(400).json(Response.error(err));
        }

        return res.send(Response.success("Logged in successfully"));
      });
    } catch (err) {
      Logs.error(err);
      res.status(400).json(Response.error(err));
    }
  },
  verifySession: async (req, res, next) => {
    try {
      if (req.session && req.user) {
        const { id, first_name, last_name, email, time_zone } = req.user;
        return res.status(200).json(
          Response.success("Session is active", {
            id,
            first_name,
            last_name,
            email,
            time_zone,
          })
        );
      } else {
        res.status(401).json(Response.error("Session is not active"));
      }
    } catch (error) {
      Logs.error(error);
      res.status(400).json({ error: error.message });
    }
  },
  userCredentials: async (req, res, next) => {
    try {
      if (req.session && req.user) {
        const { id } = req.user;

        const user = await User.findOne({ _id: id });

        if (!user) {
          throw "No user found!";
        }

        const { apiKey, secretKey } = user.api;

        return res.status(200).json(
          Response.success("Credentials:", {
            id,
            apiKey,
            secretKey,
          })
        );
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
  updateUserCredentials: async (req, res, next) => {
    try {
      if (req.session && req.user) {
        const { id } = req.user;

        const user = await User.findOne({ _id: id });

        if (!user) {
          throw "No user found!";
        }

        user.api.apiKey = Cipher.createSecretKey(10);
        user.api.secretKey = Cipher.createSecretKey(16);
        user.markModified("api"); // to update nested fields via Model
        await user.save();

        return res
          .status(200)
          .json(Response.success("Credentials updated", user));
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
