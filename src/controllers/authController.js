const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const nodemailer = require("nodemailer");

// Create Nodemailer Transporter once at the module level
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ── POST /api/auth/signup ──────────────────────────────── */
exports.signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ success: false, message: "All fields are required" });

    const tableName = role === "admin" ? "admins" : "teachers";
    const [rows] = await db.query(`SELECT id FROM ${tableName} WHERE email = ?`, [email]);
    if (rows.length)
      return res.status(409).json({ success: false, message: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    let result;

    if (role === "admin") {
      [result] = await db.query(
        `INSERT INTO admins (name, email, password, role) VALUES (?, ?, ?, ?)`,
        [name, email, hash, role]
      );
    } else {
      // Find the first admin to associate the teacher with
      let adminId = 1;
      const [adminRows] = await db.query("SELECT id FROM admins LIMIT 1");
      if (adminRows.length > 0) {
        adminId = adminRows[0].id;
      }
      
      [result] = await db.query(
        `INSERT INTO teachers (name, email, password, role, admin_id) VALUES (?, ?, ?, ?, ?)`,
        [name, email, hash, role, adminId]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully. Please log in.",
      adminId: result.insertId,
    });
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ── POST /api/auth/login ───────────────────────────────── */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    let user = null;
    let role = null;

    // 1. Check Admins Table
    const [adminRows] = await db.query("SELECT * FROM admins WHERE email = ?", [email]);
    
    if (adminRows.length > 0) {
      user = adminRows[0];
      role = "admin";
    } else {
      // 2. If not found in admins, check Teachers Table
      const [teacherRows] = await db.query("SELECT * FROM teachers WHERE email = ?", [email]);
      if (teacherRows.length > 0) {
        user = teacherRows[0];
        role = "teacher";
      }
    }

    // 3. If user doesn't exist in either table
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // 4. Verify Password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // 5. Generate Token (Include role in payload)
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: role 
      },
      process.env.JWT_SECRET || "change_this_to_a_long_random_string",
      { expiresIn: "7d" }
    );

    // 6. Return user data (excluding password)
    const { password: _pw, ...userData } = user;
    
    return res.json({ 
      success: true, 
      message: `Login successful as ${role}`, 
      token, 
      user: { ...userData, role } 
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/* ── POST /api/auth/send-otp ──────────────────────────────── */
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    let user = null;
    let tableName = null;

    // Check if user exists in admins table first
    const [adminRows] = await db.query("SELECT * FROM admins WHERE email = ?", [email]);
    if (adminRows.length > 0) {
      user = adminRows[0];
      tableName = "admins";
    } else {
      // If not, check teachers table
      const [teacherRows] = await db.query("SELECT * FROM teachers WHERE email = ?", [email]);
      if (teacherRows.length > 0) {
        user = teacherRows[0];
        tableName = "teachers";
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User with this email does not exist" });
    }

    // Rate Limiting Check (using last_otp_sent column)
    if (user.last_otp_sent) {
      const lastSent = new Date(user.last_otp_sent);
      const now = new Date();
      const diffMs = now - lastSent;
      if (diffMs < 60000) {
        const waitSec = Math.ceil((60000 - diffMs) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSec} seconds before requesting a new OTP.`
        });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    const now = new Date();

    // Store OTP, expiration, and last sent timestamp in database
    await db.query(
      `UPDATE ${tableName} SET reset_otp = ?, reset_otp_expires = ?, last_otp_sent = ? WHERE email = ?`,
      [otp, expiresAt, now, email]
    );

    // Sign the email into a short-lived token (5 mins) - NO OTP IN PAYLOAD!
    const otpToken = jwt.sign(
      { email },
      process.env.JWT_SECRET || "change_this_to_a_long_random_string",
      { expiresIn: "5m" }
    );

    // Send the email with the OTP code using module-level transporter
    await transporter.sendMail({
      from: `"Merit Home Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Password Reset OTP - Merit Home",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #4f46e5; text-align: center;">Reset Your Password</h2>
          <p>Please use the following One-Time Password (OTP) to reset your password. This OTP is valid for 5 minutes.</p>
          <div style="font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #111827; padding: 15px; margin: 20px 0; background-color: #f3f4f6; border-radius: 6px;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #6b7280;">If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    return res.json({ success: true, message: "OTP sent to your email", otpToken });
  } catch (err) {
    console.error("sendOtp error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ── POST /api/auth/verify-otp ────────────────────────────── */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, otpToken } = req.body;
    if (!email || !otp || !otpToken) {
      return res.status(400).json({ success: false, message: "Email, OTP, and token are required" });
    }

    try {
      // Decode and verify the otpToken
      const decoded = jwt.verify(otpToken, process.env.JWT_SECRET || "change_this_to_a_long_random_string");
      
      // Check if email matches
      if (decoded.email !== email) {
        return res.status(400).json({ success: false, message: "Invalid OTP token" });
      }

      let user = null;
      let tableName = null;

      // Query database for user reset details (check admins first)
      const [adminRows] = await db.query(
        "SELECT reset_otp, reset_otp_expires FROM admins WHERE email = ?",
        [email]
      );
      if (adminRows.length > 0) {
        user = adminRows[0];
        tableName = "admins";
      } else {
        // If not found in admins, check teachers
        const [teacherRows] = await db.query(
          "SELECT reset_otp, reset_otp_expires FROM teachers WHERE email = ?",
          [email]
        );
        if (teacherRows.length > 0) {
          user = teacherRows[0];
          tableName = "teachers";
        }
      }

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (!user.reset_otp || user.reset_otp !== otp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }

      const expiresAt = new Date(user.reset_otp_expires);
      if (expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
      }

      // Clear the OTP fields so it can't be reused
      await db.query(
        `UPDATE ${tableName} SET reset_otp = NULL, reset_otp_expires = NULL WHERE email = ?`,
        [email]
      );

      // Generate a temporary resetToken to allow password reset (valid for 10 mins)
      const resetToken = jwt.sign(
        { email, verified: true },
        process.env.JWT_SECRET || "change_this_to_a_long_random_string",
        { expiresIn: "10m" }
      );

      return res.json({ success: true, message: "OTP verified successfully", resetToken });
    } catch (err) {
      return res.status(400).json({ success: false, message: "OTP has expired or is invalid. Please request a new one." });
    }
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ── POST /api/auth/reset-password-otp ────────────────────── */
exports.resetPasswordOtp = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    try {
      // Verify resetToken
      const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || "change_this_to_a_long_random_string");
      if (decoded.email !== email || !decoded.verified) {
        return res.status(400).json({ success: false, message: "Invalid reset session" });
      }

      let tableName = null;

      // Determine which table the email belongs to (check admins first)
      const [adminRows] = await db.query("SELECT id FROM admins WHERE email = ?", [email]);
      if (adminRows.length > 0) {
        tableName = "admins";
      } else {
        // If not found in admins, check teachers
        const [teacherRows] = await db.query("SELECT id FROM teachers WHERE email = ?", [email]);
        if (teacherRows.length > 0) {
          tableName = "teachers";
        }
      }

      if (!tableName) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Hash the new password and update in database
      const hash = await bcrypt.hash(newPassword, 10);
      await db.query(`UPDATE ${tableName} SET password = ? WHERE email = ?`, [hash, email]);

      return res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      return res.status(400).json({ success: false, message: "Reset session has expired. Please start over." });
    }
  } catch (err) {
    console.error("resetPasswordOtp error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
