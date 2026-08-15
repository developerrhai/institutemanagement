
/**
 * PUBLIC inquiry endpoint — no JWT required.
 * Called by the shareable form at /inquiry-form
 * Add this route to your Express server BEFORE the auth-protected /api/inquiries router.
 *
 * In server.js add:
 *   app.use("/api/inquiries/public", require("./routes/inquiryPublic"));
 *   app.use("/api/inquiries", require("./routes/inquiries"));   // ← existing protected route
 */

const express = require("express");
const router  = express.Router();
const db      = require("../config/db");




// ✅ CREATE
exports.create = async (req, res) => {
  try {
    const {
      name,
      phone,
      father_name,
      father_phone,
      course,
      standard,
      dob,
      email,
      address,
      college_name,
      college_timing,
      last_exam_marks,
      father_occupation,
      mother_occupation,
      future_plans,
      reference,
      sibling_name,
      sex,
      taking_coaching,
      hostel_required,
      inquiry_date
    } = req.body;

    // ✅ Basic validation
    if (!name || !phone || !standard) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and standard are required"
      });
    }

    const [result] = await db.query(
      `INSERT INTO inquiry_extra (
        name, phone, father_name, father_phone, course, standard,
        dob, email, address, college_name, college_timing, last_exam_marks,
        father_occupation, mother_occupation, future_plans, reference,
        sibling_name, sex, taking_coaching, hostel_required, inquiry_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        phone,
        father_name,
        father_phone,
        course,
        standard,
        dob,
        email,
        address,
        college_name,
        college_timing,
        last_exam_marks,
        father_occupation,
        mother_occupation,
        future_plans,
        reference,
        sibling_name,
        sex,
        taking_coaching,
        hostel_required,
        inquiry_date || new Date()
      ]
    );

    res.json({
      success: true,
      message: "Inquiry created successfully",
      id: result.insertId
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};






// POST /api/inquiries/public — anyone can submit
/*
router.post("/", async (req, res) => {
  try {
    const {
      name, phone, father_name, father_phone,
      course, location, board, standard, status, video,
      extra = {}
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" });
    }

    // Get first admin (single-institute setup)
    const [admins] = await db.query("SELECT id FROM admins LIMIT 1");
    if (!admins.length) {
      return res.status(500).json({ success: false, message: "No admin account found" });
    }
    const adminId = admins[0].id;

    // Insert all data in one go
    const [result] = await db.query(
      `INSERT INTO inquiry_extra
         (admin_id, name, phone, father_name, father_phone, course, location, board, standard, status, video,
          dob, email, address, college_name, college_timing, last_exam_marks,
          father_occupation, mother_occupation, future_plans,
          reference, sibling_name, sex, taking_coaching, hostel_required, inquiry_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())`,
      [
        adminId,
        name,
        phone,
        father_name || "",
        father_phone || "",
        course || "",
        location || "",
        board || "",
        standard || "",
        status || "New",
        video || "",
        extra.dob || "",
        extra.email || "",
        extra.address || "",
        extra.collegeName || "",
        extra.collegeTiming || "",
        extra.lastExamMarks || "",
        extra.fatherOccupation || "",
        extra.motherOccupation || "",
        extra.futurePlans || "",
        extra.reference || "",
        extra.siblingName || "",
        extra.sex || "",
        extra.takingCoaching || "",
        extra.hostelRequired || ""
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      id: result.insertId
    });

  } catch (err) {
    console.error("Public inquiry error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}); */

router.post("/", async (req, res) => {
  try {
    console.log("Incoming Data:", req.body); // Debug

    const {
      name,
      phone,
      father_name,
      father_phone,
      course,
      location,
      board,
      standard,
      status,
      video,
      dob,
      email,
      address,
      college_name,
      college_timing,
      last_exam_marks,
      father_occupation,
      mother_occupation,
      future_plans,
      reference,
      sibling_name,
      sex,
      taking_coaching,
      hostel_required
    } = req.body;

    // ✅ Validation
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required"
      });
    }

    // ✅ Get admin
    const [admins] = await db.query("SELECT id FROM admins LIMIT 1");

    if (!admins.length) {
      return res.status(500).json({
        success: false,
        message: "No admin account found"
      });
    }

    const adminId = admins[0].id;

    // ✅ Insert Query
    const query = `
      INSERT INTO inquiry_extra
      (admin_id, name, phone, father_name, father_phone, course, location, board, standard, status, video,
       dob, email, address, college_name, college_timing, last_exam_marks,
       father_occupation, mother_occupation, future_plans,
       reference, sibling_name, sex, taking_coaching, hostel_required, inquiry_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())
    `;

    const values = [
      adminId,
      name,
      phone,
      father_name || "",
      father_phone || "",
      course || "",
      location || "",
      board || "",
      standard || "",
      status || "New",
      video || "",
      dob || "",
      email || "",
      address || "",
      college_name || "",
      college_timing || "",
      last_exam_marks || "",
      father_occupation || "",
      mother_occupation || "",
      future_plans || "",
      reference || "",
      sibling_name || "",
      sex || "",
      taking_coaching || "",
      hostel_required || ""
    ];

    const [result] = await db.query(query, values);

    // ✅ Success Response
    return res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      id: result.insertId
    });

  } catch (err) {
    console.error("Public inquiry error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});







module.exports = router;
