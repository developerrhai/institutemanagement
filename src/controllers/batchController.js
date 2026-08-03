const db = require("../config/db");

/* ── POST /api/batches (Create) ─────────────────────────── */
exports.createBatch = async (req, res) => {
  try {
    const { 
      branch_id, 
      batch_name, 
      start_time, 
      end_time, 
      batch_start_date, 
      batch_end_date 
    } = req.body;

    // Validation
    if (!branch_id || !batch_name || !start_time || !end_time || !batch_start_date || !batch_end_date) {
      return res.status(400).json({ success: false, message: "All fields are required including Branch ID" });
    }

    const [result] = await db.query(
      `INSERT INTO batches 
      (branch_id, batch_name, start_time, end_time, batch_start_date, batch_end_date) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [branch_id, batch_name, start_time, end_time, batch_start_date, batch_end_date]
    );

    return res.status(201).json({
      success: true,
      message: "Batch created and linked to branch successfully",
      batchId: result.insertId
    });
  } catch (err) {
    console.error("Create Batch Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ── GET /api/batches (Read - Filtered by Branch) ────────── */
exports.getBatchesByBranch = async (req, res) => {
  try {
    const { branch_id } = req.params; // Get branch_id from route params

    let query = "SELECT * FROM batches";
    let params = [];

    // If branch_id is provided, filter the results
    if (branch_id) {
      query += " WHERE branch_id = ?";
      params.push(branch_id);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await db.query(query, params);
    
    return res.status(200).json({ 
      success: true, 
      count: rows.length, 
      data: rows 
    });
  } catch (err) {
    console.error("Get Batches Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ── PUT /api/batches/:id (Update) ──────────────────────── */
exports.updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { batch_name, start_time, end_time, batch_start_date, batch_end_date } = req.body;

    const [result] = await db.query(
      `UPDATE batches 
       SET batch_name = ?, start_time = ?, end_time = ?, batch_start_date = ?, batch_end_date = ? 
       WHERE batch_id = ?`,
      [batch_name, start_time, end_time, batch_start_date, batch_end_date, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    return res.status(200).json({ success: true, message: "Batch updated successfully" });
  } catch (err) {
    console.error("Update Batch Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ── DELETE /api/batches/:id (Delete) ───────────────────── */
exports.deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM batches WHERE batch_id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    return res.status(200).json({ success: true, message: "Batch deleted successfully" });
  } catch (err) {
    console.error("Delete Batch Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
