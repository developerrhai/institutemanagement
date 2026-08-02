/**
 * PUBLIC admission endpoint — no JWT required.
 * Saves directly to the students table.
 *
 * Add to server.js BEFORE the protected students route:
 *   app.use("/api/admissions/public", require("./routes/admissionPublic"));
 */

const express = require("express")
const router  = express.Router()
const db      = require("../config/db")

router.post("/", async (req, res) => {
  try {
    const { name, phone, email, father_name, father_phone, board, standard, course, location, subjects} = req.body

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" })
    }

    // Basic email format validation
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" })
    }

  // Convert subjects array to comma-separated string, e.g. "Math,Science,SST"
    const subjectsStr = Array.isArray(subjects) ? subjects.join(",") : (subjects || "")


    // Check for existing student
    if (email || phone) {
      const [existing] = await db.query(
        "SELECT id FROM students WHERE email = ? OR phone = ?", 
        [email || 'N/A', phone || 'N/A']
      );
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: "Email or Phone already exists in the system." });
      }
    }

    // Attach to the first admin (single-institute setup)
    const [admins] = await db.query("SELECT id FROM admins LIMIT 1")
    if (!admins.length) {
      return res.status(500).json({ success: false, message: "No admin account configured" })
    }
    const adminId = admins[0].id

    // Generate Initial Credentials
    const phoneLast4 = phone ? phone.slice(-4) : Math.floor(1000 + Math.random() * 9000);
    const plainTextPassword = `Student@${phoneLast4}`;
    
    const bcrypt = require('bcryptjs');
    const { encrypt } = require('../utils/crypto');

    const hashedPassword = await bcrypt.hash(plainTextPassword, 12);
    const encryptedPassword = encrypt(plainTextPassword);

    const [result] = await db.query(
      `INSERT INTO students
         (admin_id, name, phone, email, father_name, father_phone, board, standard, course, location, fee, paid_fee, password, encrypted_password, is_first_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, TRUE)`,
      [
        adminId,
        name,
        phone,
        email        || "",
        father_name  || "",
        father_phone || "",
        board        || "",
        standard     || "",
        course       || "",   
        location     || "",
        hashedPassword,
        encryptedPassword
      ]
    )

    return res.status(201).json({
      success: true,
      message: "Admission submitted successfully",
      id: result.insertId,
      credentials: {
        loginId: email || phone,
        tempPassword: plainTextPassword
      }
    })

  } catch (err) {
    console.error("Public admission error:", err)
    return res.status(500).json({ success: false, message: "Server error" })
  }
})

module.exports = router
