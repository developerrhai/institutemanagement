const db = require("../config/db");

/* GET /api/profile */
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, institute, address, created_at FROM admins WHERE id = ?",
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Admin not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* PUT /api/profile */
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, institute, address } = req.body;
    await db.query(
      "UPDATE admins SET name=?, email=?, institute=?, address=? WHERE id=?",
      [name, email, institute, address, req.admin.id]
    );
    res.json({ success: true, message: "Profile updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
