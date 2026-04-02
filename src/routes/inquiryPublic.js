/**
 * PUBLIC inquiry endpoint — no JWT required.
 * Called by the shareable form at /inquiry-form
 * Add this route to your Express server BEFORE the auth-protected /api/inquiries router.
 *
 * In server.js add:
 *   app.use("/api/inquiries/public", require("./routes/inquiryPublic"));
 *   app.use("/api/inquiries", require("./routes/inquiries"));   // ← existing protected route
 */

const express = require("express")
const router  = express.Router()
const db      = require("../config/db")

// POST /api/inquiries/public  — anyone can submit (the shareable form)
router.post("/", async (req, res) => {
  try {
    const {
      name, phone, father_name, father_phone,
      course, location, board, standard, status, video,
      extra = {},
    } = req.body

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" })
    }

    // ── Option A: you have one institute (single admin) ───────────────────
    // Find the first admin account and attach the inquiry to it.
    const [admins] = await db.query("SELECT id FROM admins LIMIT 1")
    if (!admins.length) {
      return res.status(500).json({ success: false, message: "No admin account found" })
    }
    const adminId = admins[0].id

    // ── Insert inquiry ─────────────────────────────────────────────────────
    const [result] = await db.query(
      `INSERT INTO inquiries
         (admin_id, name, phone, father_name, father_phone,
          course, location, board, standard, status, video, inquiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        adminId,
        name,
        phone,
        father_name  || "",
        father_phone || "",
        course       || "",
        location     || "",
        board        || "",
        standard     || "",
        status       || "New",
        video        || "",
      ]
    )

    // ── Optionally store extra fields in a separate notes table ────────────
    // If you want to persist the extra fields, create this table once:
    //
    //   CREATE TABLE IF NOT EXISTS inquiry_extra (
    //     inquiry_id   INT UNSIGNED PRIMARY KEY,
    //     dob          VARCHAR(20)  DEFAULT '',
    //     email        VARCHAR(150) DEFAULT '',
    //     address      TEXT,
    //     college_name VARCHAR(200) DEFAULT '',
    //     college_timing VARCHAR(100) DEFAULT '',
    //     last_exam_marks VARCHAR(50) DEFAULT '',
    //     father_occupation VARCHAR(100) DEFAULT '',
    //     mother_occupation VARCHAR(100) DEFAULT '',
    //     future_plans TEXT,
    //     reference    VARCHAR(200) DEFAULT '',
    //     sibling_name VARCHAR(100) DEFAULT '',
    //     sex          VARCHAR(20)  DEFAULT '',
    //     taking_coaching VARCHAR(10) DEFAULT '',
    //     hostel_required VARCHAR(10) DEFAULT '',
    //     FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
    //   );
    //
    // Then uncomment the block below:
  
    if (Object.keys(extra).length > 0) {
      await db.query(
        `INSERT INTO inquiry_extra
           (inquiry_id, dob, email, address, college_name, college_timing,
            last_exam_marks, father_occupation, mother_occupation, future_plans,
            reference, sibling_name, sex, taking_coaching, hostel_required)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          result.insertId,
          extra.dob              || "",
          extra.email            || "",
          extra.address          || "",
          extra.collegeName      || "",
          extra.collegeTiming    || "",
          extra.lastExamMarks    || "",
          extra.fatherOccupation || "",
          extra.motherOccupation || "",
          extra.futurePlans      || "",
          extra.reference        || "",
          extra.siblingName      || "",
          extra.sex              || "",
          extra.takingCoaching   || "",
          extra.hostelRequired   || "",
        ]
      )
    }
    

    return res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      id: result.insertId,
    })

  } catch (err) {
    console.error("Public inquiry error:", err)
    return res.status(500).json({ success: false, message: "Server error" })
  }
})

module.exports = router
