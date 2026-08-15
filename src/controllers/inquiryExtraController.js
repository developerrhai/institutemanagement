const db = require("../config/db");

exports.getAll = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         id, name, phone, father_name, father_phone, course, location AS branch, board, standard,
         status, video, dob, email, address, college_name, college_timing, last_exam_marks,
         father_occupation, mother_occupation, future_plans, reference, sibling_name, sex,
         taking_coaching, hostel_required, admin_id, inquiry_date
       FROM inquiry_extra
       ORDER BY inquiry_date DESC, id DESC`
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ─────────────────────────────
// ✅ CREATE NEW INQUIRY (POST)
// ─────────────────────────────
exports.createInquiryExtra = async (req, res) => {
  try {
    const {
      name,
      phone,
      father_name,
      father_phone,
      dob,
      sex,
      email,
      address,
      standard,
      course,
      board,
      branch,
      last_exam_marks,
      college_name,
      college_timing,
      future_plans,
      father_occupation,
      mother_occupation,
      sibling_name,
      reference,
      taking_coaching,
      hostel_required,
      inquiry_date,
    } = req.body;

    // ✅ Validation
    if (!name || !phone || !standard) {
      return res.status(400).json({
        success: false,
        message: "Name, Phone and Standard are required",
      });
    }

    // ✅ Insert Query
    const [result] = await db.query(
      `INSERT INTO inquiry_extra (
        name, phone, father_name, father_phone, dob, sex, email, address,
        standard, course, board, location, last_exam_marks, college_name, college_timing,
        future_plans, father_occupation, mother_occupation, sibling_name,
        reference, taking_coaching, hostel_required, inquiry_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        phone,
        father_name,
        father_phone,
        dob,
        sex,
        email,
        address,
        standard,
        course || "",
        board || "",
        branch || "",
        last_exam_marks,
        college_name,
        college_timing,
        future_plans,
        father_occupation,
        mother_occupation,
        sibling_name,
        reference,
        taking_coaching,
        hostel_required,
        inquiry_date || new Date(),
      ]
    );

    res.json({
      success: true,
      message: "Inquiry created successfully",
      data: {
        id: result.insertId,
        ...req.body,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


exports.remove = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }

  try {
    const [result] = await db.query(
      "DELETE FROM inquiry_extra WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    return res.json({ success: true, message: "Inquiry deleted successfully" });
  } catch (error) {
    console.error("Delete inquiry error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.update = async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }
  try {
    const fields = { ...req.body };
    if (fields.branch !== undefined) {
      fields.location = fields.branch;
      delete fields.branch;
    }
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    const values = [...Object.values(fields), id];
    const [result] = await db.query(
      `UPDATE inquiry_extra SET ${setClause} WHERE id = ?`, values
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }
    res.json({ success: true, message: "Inquiry updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
