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
    const { name, phone, email, father_name, father_phone, board, standard, course, location } = req.body

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" })
    }

    // Basic email format validation
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" })
    }

    // Attach to the first admin (single-institute setup)
    const [admins] = await db.query("SELECT id FROM admins LIMIT 1")
    if (!admins.length) {
      return res.status(500).json({ success: false, message: "No admin account configured" })
    }
    const adminId = admins[0].id

    const [result] = await db.query(
      `INSERT INTO students
         (admin_id, name, phone, email, father_name, father_phone, board, standard, course, location, fee, paid_fee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [
        adminId,
        name,
        phone,
        email        || "",
        father_name  || "",
        father_phone || "",
        board        || "",
        standard     || "",
        course       || "",   // only filled for 11th & 12th
        location     || "",
      ]
    )

    return res.status(201).json({
      success: true,
      message: "Admission submitted successfully",
      id: result.insertId,
    })

  } catch (err) {
    console.error("Public admission error:", err)
    return res.status(500).json({ success: false, message: "Server error" })
  }
})

module.exports = router