const db = require("../config/db");

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM teachers WHERE admin_id = ? ORDER BY created_at DESC",
      [req.admin.id]
    );
    // parse subjects JSON string → array
    const data = rows.map((r) => ({ ...r, subjects: r.subjects ? JSON.parse(r.subjects) : [] }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM teachers WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Teacher not found" });
    const t = rows[0];
    res.json({ success: true, data: { ...t, subjects: t.subjects ? JSON.parse(t.subjects) : [] } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, email, phone, institute, location, subjects } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });

    const [result] = await db.query(
      "INSERT INTO teachers (admin_id,name,email,phone,institute,location,subjects) VALUES (?,?,?,?,?,?,?)",
      [req.admin.id, name, email||null, phone||"", institute||"", location||"",
       subjects ? JSON.stringify(subjects) : null]
    );
    res.status(201).json({ success: true, message: "Teacher created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, email, phone, institute, location, subjects } = req.body;
    const [result] = await db.query(
      "UPDATE teachers SET name=?,email=?,phone=?,institute=?,location=?,subjects=? WHERE id=? AND admin_id=?",
      [name, email||null, phone||"", institute||"", location||"",
       subjects ? JSON.stringify(subjects) : null,
       req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Teacher not found" });
    res.json({ success: true, message: "Teacher updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM teachers WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Teacher not found" });
    res.json({ success: true, message: "Teacher deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
