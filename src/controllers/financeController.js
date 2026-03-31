const db = require("../config/db");

/* GET /api/finance?type=&time_filter= */
exports.getAll = async (req, res) => {
  try {
    const { type, time_filter } = req.query;
    let sql = "SELECT * FROM finance_records WHERE admin_id = ?";
    const params = [req.admin.id];

    if (type && type !== "all") { sql += " AND type = ?"; params.push(type); }

    if (time_filter && time_filter !== "all") {
      if (time_filter === "thisMonth")
        sql += " AND MONTH(record_date)=MONTH(CURDATE()) AND YEAR(record_date)=YEAR(CURDATE())";
      else if (time_filter === "lastMonth")
        sql += " AND MONTH(record_date)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND YEAR(record_date)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))";
      else if (time_filter === "thisYear")
        sql += " AND YEAR(record_date)=YEAR(CURDATE())";
      else if (time_filter === "lastYear")
        sql += " AND YEAR(record_date)=YEAR(CURDATE())-1";
    }

    sql += " ORDER BY record_date DESC";
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/finance */
exports.create = async (req, res) => {
  try {
    const { type, name, amount, date, category } = req.body;
    if (!type || !name || !amount || !date)
      return res.status(400).json({ success: false, message: "type, name, amount and date are required" });

    const [result] = await db.query(
      "INSERT INTO finance_records (admin_id,type,name,amount,record_date,category) VALUES (?,?,?,?,?,?)",
      [req.admin.id, type, name, parseFloat(amount), date, category||""]
    );
    res.status(201).json({ success: true, message: "Record created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* DELETE /api/finance/:id */
exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM finance_records WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/finance/summary?time_filter= – payroll / expense / grand totals */
exports.summary = async (req, res) => {
  try {
    const { time_filter = "thisMonth" } = req.query;
    let condition = "admin_id = ?";
    const params = [req.admin.id];

    if (time_filter === "thisMonth")
      condition += " AND MONTH(record_date)=MONTH(CURDATE()) AND YEAR(record_date)=YEAR(CURDATE())";
    else if (time_filter === "lastMonth")
      condition += " AND MONTH(record_date)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND YEAR(record_date)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))";
    else if (time_filter === "thisYear")
      condition += " AND YEAR(record_date)=YEAR(CURDATE())";
    else if (time_filter === "lastYear")
      condition += " AND YEAR(record_date)=YEAR(CURDATE())-1";

    const [rows] = await db.query(
      `SELECT
         SUM(CASE WHEN type='Payroll' THEN amount ELSE 0 END) AS total_payroll,
         SUM(CASE WHEN type='Expense' THEN amount ELSE 0 END) AS total_expense,
         SUM(amount) AS grand_total
       FROM finance_records WHERE ${condition}`,
      params
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
