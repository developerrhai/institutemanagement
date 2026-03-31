const db = require("../config/db");

function computeStatus(amount, paidAmount, dueDate) {
  if (paidAmount >= amount) return "Paid";
  if (paidAmount > 0) return "Partial";
  if (dueDate && new Date(dueDate) < new Date()) return "Overdue";
  return "Pending";
}

exports.getAll = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = "SELECT * FROM invoices WHERE admin_id = ?";
    const params = [req.admin.id];
    if (status && status !== "all") { sql += " AND status = ?"; params.push(status); }
    sql += " ORDER BY created_at DESC";
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM invoices WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { student_name, student_id, amount, paid_amount, due_date, description } = req.body;
    if (!student_name || !amount)
      return res.status(400).json({ success: false, message: "Student name and amount are required" });

    const paid = parseFloat(paid_amount) || 0;
    const total = parseFloat(amount);
    const status = computeStatus(total, paid, due_date);

    const [result] = await db.query(
      `INSERT INTO invoices (admin_id,student_id,student_name,amount,paid_amount,due_date,status,description)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.admin.id, student_id||null, student_name, total, paid, due_date||null, status, description||""]
    );
    res.status(201).json({ success: true, message: "Invoice created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { student_name, student_id, amount, paid_amount, due_date, description } = req.body;
    const paid = parseFloat(paid_amount) || 0;
    const total = parseFloat(amount);
    const status = computeStatus(total, paid, due_date);

    const [result] = await db.query(
      `UPDATE invoices
       SET student_name=?,student_id=?,amount=?,paid_amount=?,due_date=?,status=?,description=?
       WHERE id=? AND admin_id=?`,
      [student_name, student_id||null, total, paid, due_date||null, status, description||"",
       req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, message: "Invoice updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM invoices WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, message: "Invoice deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/invoices/summary – totals for the summary cards */
exports.summary = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         SUM(amount)      AS total_invoiced,
         SUM(paid_amount) AS total_paid,
         SUM(amount - paid_amount) AS total_pending
       FROM invoices WHERE admin_id = ?`,
      [req.admin.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
