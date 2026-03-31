const db = require("../config/db");

/* GET /api/dashboard/stats */
exports.stats = async (req, res) => {
  try {
    const aid = req.admin.id;

    const [[{ students }]] = await db.query("SELECT COUNT(*) AS students FROM students WHERE admin_id=?", [aid]);
    const [[{ teachers }]] = await db.query("SELECT COUNT(*) AS teachers FROM teachers WHERE admin_id=?", [aid]);
    const [[{ revenue }]] = await db.query("SELECT COALESCE(SUM(paid_fee),0) AS revenue FROM students WHERE admin_id=?", [aid]);

    res.json({
      success: true,
      data: { students, teachers, revenue, live_classes: 5 },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/dashboard/payment-status */
exports.paymentStatus = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         SUM(CASE WHEN paid_fee >= fee THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN paid_fee < fee  THEN 1 ELSE 0 END) AS pending
       FROM students WHERE admin_id=?`,
      [req.admin.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/dashboard/students-by-standard */
exports.studentsByStandard = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT standard AS name, COUNT(*) AS count FROM students WHERE admin_id=? GROUP BY standard ORDER BY standard+0",
      [req.admin.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/dashboard/students-by-location */
exports.studentsByLocation = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT location AS name, COUNT(*) AS count FROM students WHERE admin_id=? GROUP BY location",
      [req.admin.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/dashboard/fee-collection – last 6 months */
exports.feeCollection = async (req, res) => {
  try {
    // invoices grouped by month
    const [rows] = await db.query(
      `SELECT
         DATE_FORMAT(created_at,'%b') AS month,
         SUM(paid_amount)            AS collected,
         SUM(amount - paid_amount)   AS pending
       FROM invoices
       WHERE admin_id=? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY YEAR(created_at), MONTH(created_at)
       ORDER BY YEAR(created_at), MONTH(created_at)`,
      [req.admin.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/dashboard/finance-overview – income vs expense last 6 months */
exports.financeOverview = async (req, res) => {
  try {
    // income = fee collected per month
    const [income] = await db.query(
      `SELECT DATE_FORMAT(created_at,'%b') AS month, MONTH(created_at) AS m, YEAR(created_at) AS y,
              SUM(paid_amount) AS income
       FROM invoices
       WHERE admin_id=? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY y,m ORDER BY y,m`,
      [req.admin.id]
    );
    // expense = payroll + expenses per month
    const [expense] = await db.query(
      `SELECT DATE_FORMAT(record_date,'%b') AS month, MONTH(record_date) AS m, YEAR(record_date) AS y,
              SUM(amount) AS expense
       FROM finance_records
       WHERE admin_id=? AND record_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY y,m ORDER BY y,m`,
      [req.admin.id]
    );

    // merge by month label
    const map = {};
    income.forEach(({ month, income }) => { map[month] = { month, income: +income, expense: 0 }; });
    expense.forEach(({ month, expense }) => {
      if (!map[month]) map[month] = { month, income: 0, expense: +expense };
      else map[month].expense = +expense;
    });

    const data = Object.values(map).map((d) => ({ ...d, profit: d.income - d.expense }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
