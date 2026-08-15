const express = require("express");
const db = require("../config/db");
const { syncBiometricAttendance } = require("../services/smartOffice.service");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Helper to fetch attendance records for a specific date and role
const getAttendanceForDate = async (date, roleFilter = 'STUDENT') => {
  let users = [];
  if (roleFilter === 'STUDENT') {
    const [students] = await db.query(
      "SELECT id, name, standard, course, phone as contact, biometric_code FROM students WHERE deleted_at IS NULL ORDER BY name ASC"
    );
    users = students.map(s => ({ ...s, role: 'STUDENT' }));
  } else {
    const [teachers] = await db.query(
      "SELECT id, name, phone as contact, biometric_code FROM teachers ORDER BY name ASC"
    );
    users = teachers.map(t => ({ ...t, role: 'TEACHER', standard: 'Staff', course: '' }));
  }

  // Fetch all existing attendance records from DB for this date
  const [records] = await db.query(
    `SELECT a.*, b.batch_name 
     FROM attendance a
     LEFT JOIN batches b ON a.batch_id = b.batch_id
     WHERE a.date = ? AND a.role = ?`,
    [date, roleFilter]
  );

  const recordMap = new Map();
  for (const r of records) {
    recordMap.set(r.user_id, r);
  }

  const results = [];
  for (const u of users) {
    const rec = recordMap.get(u.id);
    results.push({
      student: { // Nesting as student to match frontend expectations
        id: u.id,
        name: u.name,
        contact: u.contact,
        standard: u.standard || "",
        course: u.course || "",
        code: u.biometric_code || ""
      },
      role: u.role,
      date,
      punchIn: rec ? rec.punch_in_time : null,
      punchOut: rec ? rec.punch_out_time : null,
      status: rec ? rec.status : 'Absent',
      source: rec ? rec.source : 'Manual',
      batch: rec ? {
        id: rec.batch_id,
        name: rec.batch_name || "General Batch"
      } : { id: null, name: "General Batch" },
      manuallyEdited: rec ? (rec.source === 'Manual') : false
    });
  }

  // Compute summary stats
  const summary = {
    total: results.length,
    present: results.filter(r => r.status === 'Present').length,
    absent: results.filter(r => r.status === 'Absent').length,
    late: results.filter(r => r.status === 'Late').length,
    onLeave: results.filter(r => r.status === 'On Leave').length
  };

  return {
    success: true,
    records: results,
    summary,
    syncedAt: new Date().toISOString()
  };
};

// ── GET /api/attendance?date=YYYY-MM-DD&role=STUDENT ────────────────────────
router.get("/", protect, authorize(["ADMIN", "TEACHER"]), async (req, res) => {
  const { date, role = 'STUDENT' } = req.query;

  if (!date) {
    return res.status(400).json({ success: false, error: "date query param is required (YYYY-MM-DD)" });
  }

  try {
    const result = await getAttendanceForDate(date, role.toUpperCase());
    return res.json(result);
  } catch (err) {
    console.error("[Attendance] Fetch Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/attendance/sync ─────────────────────────────────────────────────
router.post("/sync", protect, authorize(["ADMIN", "TEACHER"]), async (req, res) => {
  const { date, role = 'STUDENT' } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, error: "date is required in body" });
  }

  try {
    // Run biometric sync to read logs and write to DB
    await syncBiometricAttendance(date);
    
    // Retrieve the newly updated records list
    const result = await getAttendanceForDate(date, role.toUpperCase());
    return res.json(result);
  } catch (err) {
    console.error("[Attendance] Sync Error:", err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
});

// ── POST /api/attendance/leave ────────────────────────────────────────────────
router.post("/leave", protect, authorize(["ADMIN", "TEACHER"]), async (req, res) => {
  const { studentCode, date, batchId, role = 'STUDENT' } = req.body;

  if (!studentCode || !date) {
    return res.status(400).json({ success: false, error: "studentCode and date are required" });
  }

  try {
    const targetRole = role.toUpperCase();
    const table = targetRole === 'STUDENT' ? 'students' : 'teachers';
    
    // Find the user ID based on their biometric code
    const [users] = await db.query(`SELECT id FROM ${table} WHERE biometric_code = ?`, [studentCode]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: `User with biometric code "${studentCode}" not found` });
    }

    const userId = users[0].id;

    // Mark as on leave in attendance overrides
    await db.query(
      `INSERT INTO attendance (user_id, role, date, status, source, batch_id)
       VALUES (?, ?, ?, 'On Leave', 'Manual', ?)
       ON DUPLICATE KEY UPDATE status = 'On Leave', source = 'Manual'`,
      [userId, targetRole, date, batchId || null]
    );

    return res.json({ success: true, message: `Leave marked for ${studentCode} on ${date}` });
  } catch (err) {
    console.error("[Attendance] Leave Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/attendance/record (Manual Edit) ──────────────────────────────────
router.put("/record", protect, authorize(["ADMIN", "TEACHER"]), async (req, res) => {
  const { studentCode, date, status, punchIn, punchOut, batchId, role = 'STUDENT' } = req.body;

  if (!studentCode || !date) {
    return res.status(400).json({ success: false, error: "studentCode and date are required" });
  }

  const validStatuses = ["Present", "Absent", "Late", "On Leave", "Half-Day"];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    const targetRole = role.toUpperCase();
    const table = targetRole === 'STUDENT' ? 'students' : 'teachers';

    // Get user id from biometric code
    const [users] = await db.query(`SELECT id FROM ${table} WHERE biometric_code = ?`, [studentCode]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: `User with biometric code "${studentCode}" not found` });
    }

    const userId = users[0].id;

    // Upsert the record into attendance table
    await db.query(
      `INSERT INTO attendance (user_id, role, date, status, punch_in_time, punch_out_time, source, batch_id)
       VALUES (?, ?, ?, ?, ?, ?, 'Manual', ?)
       ON DUPLICATE KEY UPDATE 
         status = COALESCE(VALUES(status), status),
         punch_in_time = COALESCE(VALUES(punch_in_time), punch_in_time),
         punch_out_time = COALESCE(VALUES(punch_out_time), punch_out_time),
         source = 'Manual'`,
      [userId, targetRole, date, status || null, punchIn || null, punchOut || null, batchId || null]
    );

    return res.json({ success: true, message: `Attendance updated for ${studentCode} on ${date}` });
  } catch (err) {
    console.error("[Attendance] Record Manual Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/attendance/notify-whatsapp ──────────────────────────────────────
router.post("/notify-whatsapp", protect, authorize(["ADMIN", "TEACHER"]), async (req, res) => {
  const { date, role = 'STUDENT' } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, error: "date is required" });
  }

  try {
    const result = await getAttendanceForDate(date, role.toUpperCase());
    const absentStudents = result.records.filter(r => r.status === "Absent");

    res.json({
      success: true,
      message: `WhatsApp notification sending started in background for ${absentStudents.length} absent students.`,
      date
    });

    // Run the sending loop asynchronously in background to prevent request timeouts
    (async () => {
      const axios = require("axios");
      const FormData = require("form-data");
      
      for (const record of absentStudents) {
        try {
          const student = record.student;
          if (!student?.contact) continue;

          let mobile = String(student.contact).replace(/\D/g, "");
          if (!mobile.startsWith("91")) {
            mobile = "91" + mobile;
          }

          const form = new FormData();
          form.append("appkey", process.env.WHATSAPP_APP_KEY || "placeholder_app_key");
          form.append("authkey", process.env.WHATSAPP_AUTH_KEY || "placeholder_auth_key");
          form.append("to", mobile);
          form.append("template_id", process.env.WHATSAPP_TEMPLATE_ID || "attendence");
          form.append("language", "en");

          form.append("variables[{variableKey1}]", student.name);
          form.append("variables[{variableKey2}]", `Absent from class`);
          form.append("variables[{variableKey3}]", new Date(date).toLocaleDateString());

          await axios.post("https://api.rhaitech.online/api/create-message", form, {
            headers: form.getHeaders(),
            timeout: 10000,
          });

          console.log(`[WhatsApp Sent] Notification sent to ${student.name}`);
        } catch (err) {
          console.error(`[WhatsApp Error] Failed for ${record.student?.name}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 1500)); // Rate limiting gap
      }
    })();
  } catch (err) {
    console.error("[WhatsApp Sync error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/attendance/my-attendance (Student's own attendance logs) ─────────
router.get("/my-attendance", protect, authorize(["STUDENT"]), async (req, res) => {
  try {
    const studentId = req.user.id;
    const [rows] = await db.query(
      `SELECT date, punch_in_time, punch_out_time, status, source 
       FROM attendance 
       WHERE user_id = ? AND role = 'STUDENT' 
       ORDER BY date DESC`,
      [studentId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[Attendance] Fetch My Attendance Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// v1 Compat routes (so any other smart office integration API route naming works)
router.post("/v1/punch", protect, authorize(["ADMIN", "TEACHER"]), (req, res) => res.redirect(307, "/api/attendance/record"));
router.get("/v1/logs", protect, authorize(["ADMIN", "TEACHER"]), (req, res) => res.redirect(307, "/api/attendance"));
router.post("/v1/sync-smart-office", protect, authorize(["ADMIN", "TEACHER"]), (req, res) => res.redirect(307, "/api/attendance/sync"));

module.exports = router;
