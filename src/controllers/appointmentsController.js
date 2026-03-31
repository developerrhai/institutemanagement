const db = require("../config/db");

exports.getAll = async (req, res) => {
  try {
    const { date_filter, location } = req.query;
    let sql = "SELECT * FROM appointments WHERE admin_id = ?";
    const params = [req.admin.id];

    if (location && location !== "all") { sql += " AND location = ?"; params.push(location); }

    if (date_filter && date_filter !== "all") {
      if (date_filter === "today")
        sql += " AND appointment_date = CURDATE()";
      else if (date_filter === "tomorrow")
        sql += " AND appointment_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)";
      else if (date_filter === "nextWeek")
        sql += " AND appointment_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)";
      else if (date_filter === "lastWeek")
        sql += " AND appointment_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
    }

    sql += " ORDER BY appointment_date ASC, appointment_time ASC";
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM appointments WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Appointment not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, standard, board, course, date, time, location, whatsapp, status } = req.body;
    if (!name || !date || !time)
      return res.status(400).json({ success: false, message: "Name, date and time are required" });

    const [result] = await db.query(
      `INSERT INTO appointments
         (admin_id,name,standard,board,course,appointment_date,appointment_time,location,whatsapp,status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.admin.id, name, standard||"", board||"", course||"", date, time, location||"", whatsapp||"", status||"Pending"]
    );
    res.status(201).json({ success: true, message: "Appointment created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, standard, board, course, date, time, location, whatsapp, status } = req.body;
    const [result] = await db.query(
      `UPDATE appointments
       SET name=?,standard=?,board=?,course=?,appointment_date=?,appointment_time=?,location=?,whatsapp=?,status=?
       WHERE id=? AND admin_id=?`,
      [name, standard||"", board||"", course||"", date, time, location||"", whatsapp||"", status||"Pending",
       req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Appointment not found" });
    res.json({ success: true, message: "Appointment updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM appointments WHERE id = ? AND admin_id = ?",
      [req.params.id, req.admin.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Appointment not found" });
    res.json({ success: true, message: "Appointment deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
