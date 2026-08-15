const db = require("../config/db");

// Helper to check if teacher is mapped to a batch
async function checkTeacherBatchAccess(teacherId, batchName) {
  const [rows] = await db.query(
    "SELECT id FROM teacher_batches WHERE teacher_id = ?",
    [teacherId]
  );
  if (rows.length === 0) {
    // If no mappings are configured for this teacher, default to allowing access
    return { hasMappings: true, allowed: true };
  }

  const [match] = await db.query(
    "SELECT id FROM teacher_batches WHERE teacher_id = ? AND LOWER(TRIM(batch)) = LOWER(TRIM(?))",
    [teacherId, batchName]
  );
  return { hasMappings: true, allowed: match.length > 0 };
}

// ── 1. CREATE TEACHING LOG ─────────────────────────────
exports.createLog = async (req, res) => {
  try {
    const { date, subject, topicCovered, batch, notes } = req.body;
    const { id: teacherId, role } = req.user;

    if (!date || !subject || !topicCovered || !batch) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (role === 'TEACHER') {
      const access = await checkTeacherBatchAccess(teacherId, batch);
      if (!access.hasMappings) {
        return res.status(403).json({
          success: false,
          message: "No batch mappings configured. Contact admin to assign your batches."
        });
      }
      if (!access.allowed) {
        return res.status(403).json({ 
          success: false, 
          message: `You are not authorized to create logs for batch: ${batch}` 
        });
      }
    }

    const [result] = await db.query(
      `INSERT INTO teaching_logs (class_date, subject, topic, notes, batch, teacher_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE topic = VALUES(topic), notes = VALUES(notes)`,
      [date, subject, topicCovered, batch, notes || null, teacherId]
    );

    res.status(201).json({ success: true, message: "Teaching log recorded successfully", logId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 2. GET LOGS FOR A BATCH ────────────────────────────
exports.getLogsByBatch = async (req, res) => {
  try {
    const { batch } = req.params;
    const { role, standard, course } = req.user;

    // Enforce student batch scoping
    if (role === 'STUDENT') {
      const studentBatch = `${standard || ''} ${course || ''}`.trim().toLowerCase();
      const requestedBatch = batch.trim().toLowerCase();
      
      if (!requestedBatch.includes(studentBatch) && !studentBatch.includes(requestedBatch)) {
        return res.status(403).json({ success: false, message: "You can only view logs for your own class" });
      }
    }

    const [logs] = await db.query(
      `SELECT tl.*, t.name as teacher_name 
       FROM teaching_logs tl
       JOIN teachers t ON tl.teacher_id = t.id
       WHERE LOWER(TRIM(tl.batch)) = LOWER(TRIM(?))
       ORDER BY tl.class_date DESC, tl.created_at DESC`,
      [batch]
    );

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 3. GET TEACHER'S OWN LOGS ──────────────────────────
exports.getTeacherLogs = async (req, res) => {
  try {
    const { id: teacherId } = req.user;

    const [logs] = await db.query(
      `SELECT * FROM teaching_logs WHERE teacher_id = ? ORDER BY class_date DESC`,
      [teacherId]
    );

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 4. GET SYSTEM OVERVIEW (ADMIN ONLY) ───────────────
exports.getOverview = async (req, res) => {
  try {
    // 1. Logs submitted today
    const [todayLogs] = await db.query(
      `SELECT tl.*, t.name as teacher_name FROM teaching_logs tl
       JOIN teachers t ON tl.teacher_id = t.id
       WHERE tl.class_date = CURDATE()`
    );

    // 2. Alert 1: Batches with missing daily logs for today
    // We get all distinct active batches from students, and see which ones don't have a log today
    const [batchesToday] = await db.query(
      `SELECT DISTINCT CONCAT(standard, ' ', course) as batch_name FROM students 
       WHERE deleted_at IS NULL AND standard != ''`
    );

    const missingLogBatches = [];
    for (const b of batchesToday) {
      if (!b.batch_name) continue;
      const [logged] = await db.query(
        "SELECT id FROM teaching_logs WHERE LOWER(TRIM(batch)) = LOWER(TRIM(?)) AND class_date = CURDATE()",
        [b.batch_name]
      );
      if (logged.length === 0) {
        missingLogBatches.push(b.batch_name);
      }
    }

    // 3. Alert 2: Homework assignments assigned >= 3 days ago with 0 updates
    const [staleHomework] = await db.query(
      `SELECT h.*, t.name as teacher_name FROM homework h
       JOIN teachers t ON h.teacher_id = t.id
       WHERE h.created_at <= DATE_SUB(NOW(), INTERVAL 3 DAY)
       AND h.is_deleted = FALSE
       AND NOT EXISTS (SELECT 1 FROM homework_status WHERE homework_id = h.id)`
    );

    // 4. Alert 3: Teachers with no batch mappings configured
    const [unmappedTeachers] = await db.query(
      `SELECT id, name FROM teachers t
       WHERE NOT EXISTS (SELECT 1 FROM teacher_batches WHERE teacher_id = t.id)`
    );

    res.json({
      success: true,
      data: {
        todayLogsCount: todayLogs.length,
        todayLogs,
        alerts: {
          missingLogsToday: missingLogBatches,
          staleHomework: staleHomework,
          unmappedTeachers: unmappedTeachers
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
