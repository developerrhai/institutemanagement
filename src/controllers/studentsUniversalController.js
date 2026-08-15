const db = require("../config/db");

exports.getAll = async (req, res) => {
  try {
    const { standard, board, location, search } = req.query;
    let sql = "SELECT * FROM students WHERE 1=1 AND deleted_at IS NULL";
    const params = [];

    if (standard) { sql += " AND standard = ?"; params.push(standard); }
    if (board) { sql += " AND board = ?"; params.push(board); }
    if (location) { sql += " AND location = ?"; params.push(location); }
    if (search) {
      sql += " AND (name LIKE ? OR phone LIKE ? OR father_phone LIKE ? OR email LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    sql += " ORDER BY created_at DESC, id DESC";
    const [rows] = await db.query(sql, params);

    res.json({
      success: true,
      message: "Universal students fetched",
      requested_by_admin_id: req.admin.id,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

