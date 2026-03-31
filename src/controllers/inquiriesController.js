const db = require("../config/db");

exports.getAll = async (req, res) => {
  try {
    const { date_filter, location, standard } = req.query;
    let sql = "SELECT * FROM inquiries WHERE admin_id = ?";
    const params = [req.admin.id];

    if (location && location !== "all") { sql += " AND location = ?"; params.push(location); }
    if (standard && standard !== "all") { sql += " AND standard = ?"; params.push(standard); }

    if (date_filter && date_filter !== "all") {
      const today = new Date().toISOString().split("T")[0];
      if (date_filter === "today")
        sql += ` AND inquiry_date = '${today}'`;
      else if (date_filter === "yesterday")
        sql += ` AND inquiry_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
      else if (date_filter === "last7")
        sql += ` AND inquiry_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
      else if (date_filter === "last30")
        sql += ` AND inquiry_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    }

    sql += " ORDER BY inquiry_date DESC, created_at DESC";
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM inquiries WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, phone, father_name, father_phone, course, location, board, standard, status, video } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: "Name and phone are required" });

    const [result] = await db.query(
      `INSERT INTO inquiries
         (admin_id,name,phone,father_name,father_phone,course,location,board,standard,status,video,inquiry_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,CURDATE())`,
      [req.admin.id, name, phone, father_name||"", father_phone||"",
       course||"", location||"", board||"", standard||"", status||"New", video||""]
    );
    res.status(201).json({ success: true, message: "Inquiry created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, phone, father_name, father_phone, course, location, board, standard, status, video } = req.body;
    const [result] = await db.query(
      `UPDATE inquiries
       SET name=?,phone=?,father_name=?,father_phone=?,course=?,location=?,board=?,standard=?,status=?,video=?
       WHERE id=? AND admin_id=?`,
      [name, phone, father_name||"", father_phone||"", course||"", location||"",
       board||"", standard||"", status||"New", video||"",
       req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, message: "Inquiry updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM inquiries WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, message: "Inquiry deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
