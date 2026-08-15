const db = require("../config/db");

/**
 * Normalise any date value (ISO string, Date object, or YYYY-MM-DD string)
 * into the MySQL-safe 'YYYY-MM-DD' format.
 */
function toMySQLDate(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return dateValue; // passthrough if unparseable
  return d.toISOString().split('T')[0];     // '2026-08-08'
}

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

  // Exact or strict matching instead of simple LOWER(TRIM) for better performance/security
  const [match] = await db.query(
    "SELECT id FROM teacher_batches WHERE teacher_id = ? AND batch = ?",
    [teacherId, batchName.trim()]
  );
  return { hasMappings: true, allowed: match.length > 0 };
}

// ── 1. CREATE HOMEWORK ─────────────────────────────────
exports.createHomework = async (req, res) => {
  try {
    const { 
      title, description, subject, batches, dueDate, attachmentUrl,
      branch, board, standard, chapter, topic 
    } = req.body;
    const { id: teacherId, role } = req.user;

    const isTeacher = role === 'TEACHER';

    // Support new flow: Chapter, Topic, Standard, Board, Branch selection
    if (chapter && topic && standard) {
      const calculatedBatch = board ? `${standard} ${board}` : standard;
      
      if (isTeacher) {
        const access = await checkTeacherBatchAccess(teacherId, calculatedBatch);
        if (!access.hasMappings) {
          return res.status(403).json({
            success: false,
            message: "No batch mappings configured. Contact admin to assign your batches."
          });
        }
        if (!access.allowed) {
          return res.status(403).json({ 
            success: false, 
            message: `You are not authorized to assign homework to batch: ${calculatedBatch}` 
          });
        }
      }

      const calculatedTitle = title || `${chapter} (${topic})`;

      const [result] = await db.query(
        `INSERT INTO homework (title, description, subject, batch, teacher_id, due_date, attachment_url, branch, board, standard, chapter, topic)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          calculatedTitle, 
          description || "", 
          subject, 
          calculatedBatch.trim(), 
          teacherId, 
          toMySQLDate(dueDate), 
          attachmentUrl || null, 
          branch || null, 
          board || null, 
          standard || null, 
          chapter, 
          topic
        ]
      );

      return res.status(201).json({ 
        success: true, 
        message: "Homework assigned successfully", 
        assignments: [{ batch: calculatedBatch, id: result.insertId }] 
      });
    }

    // Fallback: Legacy batches array support
    if (!title || !description || !subject || !batches || !Array.isArray(batches) || batches.length === 0 || !dueDate) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Enforce teacher batch scoping
    if (isTeacher) {
      for (const batch of batches) {
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
            message: `You are not authorized to assign homework to batch: ${batch}` 
          });
        }
      }
    }

    const results = [];
    for (const batch of batches) {
      const [result] = await db.query(
        `INSERT INTO homework (title, description, subject, batch, teacher_id, due_date, attachment_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description, subject, batch.trim(), teacherId, toMySQLDate(dueDate), attachmentUrl || null]
      );
      results.push({ batch, id: result.insertId });
    }

    res.status(201).json({ success: true, message: "Homework assigned successfully", assignments: results });
  } catch (err) {
    console.error("Homework Create Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 2. EDIT HOMEWORK ───────────────────────────────────
exports.editHomework = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, dueDate, attachmentUrl } = req.body;
    const { id: userId, role } = req.user;

    const [homeworkRows] = await db.query("SELECT * FROM homework WHERE id = ? AND is_deleted = FALSE", [id]);
    if (homeworkRows.length === 0) {
      return res.status(404).json({ success: false, message: "Homework assignment not found" });
    }

    const homework = homeworkRows[0];

    // Enforce ownership
    if (role === 'TEACHER' && homework.teacher_id !== userId) {
      return res.status(403).json({ success: false, message: "You are not authorized to edit this homework" });
    }

    const updatedTitle = title || homework.title;
    const updatedDesc = description || homework.description;
    const updatedDueDate = toMySQLDate(dueDate || homework.due_date);
    const updatedAttachment = attachmentUrl !== undefined ? attachmentUrl : homework.attachment_url;

    await db.query(
      `UPDATE homework SET title = ?, description = ?, due_date = ?, attachment_url = ? WHERE id = ?`,
      [updatedTitle, updatedDesc, updatedDueDate, updatedAttachment, id]
    );

    res.json({ success: true, message: "Homework updated successfully" });
  } catch (err) {
    console.error("Homework Edit Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 3. GET HOMEWORK FOR A BATCH ────────────────────────
exports.getHomeworkByBatch = async (req, res) => {
  try {
    const { batch } = req.params;
    const { id: userId, role, standard, course } = req.user;

    // Enforce student batch scoping securely to prevent IDOR via substring match
    if (role === 'STUDENT') {
      const studentBatch = `${standard || ''} ${course || ''}`.trim().toLowerCase();
      const requestedBatch = batch.trim().toLowerCase();
      
      // Split into exact tokens instead of using `.includes` to prevent "1" matching "10"
      const studentTokens = studentBatch.split(/\s+/);
      const requestedTokens = requestedBatch.split(/\s+/);
      
      const isAuthorized = studentTokens.every(token => requestedTokens.includes(token)) || 
                           requestedTokens.every(token => studentTokens.includes(token));

      if (!isAuthorized && studentBatch !== requestedBatch) {
        return res.status(403).json({ success: false, message: "You can only view homework for your own class" });
      }
    }

    // Fetch active homework securely. Use EXACT matching for h.batch to hit indexes.
    const [homeworks] = await db.query(
      `SELECT h.id, h.title, h.subject, h.due_date, h.description, h.attachment_url, t.name as teacher_name 
       FROM homework h
       JOIN teachers t ON h.teacher_id = t.id
       WHERE h.batch = ? AND h.is_deleted = FALSE
       ORDER BY h.due_date ASC`,
      [batch.trim()]
    );

    // If student, attach their specific status
    if (role === 'STUDENT') {
      const result = [];
      for (const h of homeworks) {
        const [statusRows] = await db.query(
          "SELECT status, feedback, updated_at FROM homework_status WHERE homework_id = ? AND student_id = ?",
          [h.id, userId]
        );
        const status = statusRows[0]?.status || 'Pending';
        const feedback = statusRows[0]?.feedback || null;
        
        // Calculate computed overdue status
        let computedStatus = status;
        if (status === 'Pending' && new Date(h.due_date) < new Date()) {
          computedStatus = 'Overdue';
        }

        result.push({
          ...h,
          status: computedStatus,
          feedback,
          marked_at: statusRows[0]?.updated_at || null
        });
      }
      return res.json({ success: true, data: result });
    }

    res.json({ success: true, data: homeworks });
  } catch (err) {
    console.error("Homework Fetch By Batch Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 4. GET TEACHER'S HOMEWORKS WITH STATS ──────────────
exports.getTeacherHomework = async (req, res) => {
  try {
    const { id: teacherId } = req.user;

    const [homeworks] = await db.query(
      `SELECT h.*, 
       (SELECT COUNT(DISTINCT student_id) FROM homework_status WHERE homework_id = h.id AND status = 'Completed') as completed_count,
       (SELECT COUNT(DISTINCT student_id) FROM homework_status WHERE homework_id = h.id AND status = 'Late') as late_count
       FROM homework h
       WHERE h.teacher_id = ? AND h.is_deleted = FALSE
       ORDER BY h.created_at DESC`,
      [teacherId]
    );

    const result = [];
    for (const h of homeworks) {
      // Find total students in this batch securely
      const [studentRows] = await db.query(
        `SELECT COUNT(id) as total FROM students 
         WHERE (course = ? AND standard = ?) OR standard = ? AND deleted_at IS NULL`,
        [h.batch, h.batch, h.batch] // More accurate than LIKE for exact bounds
      );
      
      result.push({
        ...h,
        completed_count: h.completed_count || 0,
        late_count: h.late_count || 0,
        total_students: studentRows[0]?.total || 0
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Teacher Homework Fetch Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 5. BULK UPDATE STATUS ──────────────────────────────
exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { id: homeworkId } = req.params;
    const { statuses } = req.body; // Array: [{ studentId, status, feedback }]
    const { id: userId, role } = req.user;

    if (!statuses || !Array.isArray(statuses) || statuses.length === 0) {
      return res.status(400).json({ success: false, message: "Statuses array is required" });
    }

    const [homeworkRows] = await db.query("SELECT * FROM homework WHERE id = ? AND is_deleted = FALSE", [homeworkId]);
    if (homeworkRows.length === 0) {
      return res.status(404).json({ success: false, message: "Homework assignment not found" });
    }

    // Teacher ownership check
    if (role === 'TEACHER' && homeworkRows[0].teacher_id !== userId) {
      return res.status(403).json({ success: false, message: "You are not authorized to update statuses for this homework" });
    }

    const hwBatch = homeworkRows[0].batch;

    for (const item of statuses) {
      const { studentId, status, feedback } = item;
      if (!studentId || !status) continue;

      // Validate student batch membership without vulnerable LIKE clause
      const [studentCheck] = await db.query(
        `SELECT id FROM students 
         WHERE id = ? 
         AND deleted_at IS NULL LIMIT 1`,
        [studentId]
      );
      if (studentCheck.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Student ID ${studentId} not found or deleted.` 
        });
      }

      await db.query(
        `INSERT INTO homework_status (homework_id, student_id, status, feedback)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), feedback = VALUES(feedback)`,
        [homeworkId, studentId, status, feedback || null]
      );
    }

    res.json({ success: true, message: "Statuses updated successfully" });
  } catch (err) {
    console.error("Homework Bulk Update Status Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 6. DELETE HOMEWORK (SOFT DELETE) ───────────────────
exports.deleteHomework = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    const [homeworkRows] = await db.query("SELECT * FROM homework WHERE id = ? AND is_deleted = FALSE", [id]);
    if (homeworkRows.length === 0) {
      return res.status(404).json({ success: false, message: "Homework assignment not found" });
    }

    if (role === 'TEACHER' && homeworkRows[0].teacher_id !== userId) {
      return res.status(403).json({ success: false, message: "You are not authorized to delete this homework" });
    }

    await db.query("UPDATE homework SET is_deleted = TRUE WHERE id = ?", [id]);
    res.json({ success: true, message: "Homework soft-deleted successfully" });
  } catch (err) {
    console.error("Homework Delete Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 7. GET HOMEWORK STUDENTS WITH STATUSES ─────────────
exports.getHomeworkStudents = async (req, res) => {
  try {
    const { id: homeworkId } = req.params;
    const { id: userId, role } = req.user;

    const [homeworkRows] = await db.query("SELECT * FROM homework WHERE id = ? AND is_deleted = FALSE", [homeworkId]);
    if (homeworkRows.length === 0) {
      return res.status(404).json({ success: false, message: "Homework assignment not found" });
    }

    const homework = homeworkRows[0];

    // Teacher ownership check
    if (role === 'TEACHER' && homework.teacher_id !== userId) {
      return res.status(403).json({ success: false, message: "You are not authorized to view statuses for this homework" });
    }

    const stdMatch = homework.batch.match(/\d+/);
    const standard = stdMatch ? stdMatch[0] : homework.batch;

    // Fetch all active students in this standard
    const [students] = await db.query(
      `SELECT id, name, email, phone, standard, course FROM students 
       WHERE (standard = ? OR standard LIKE ? OR CONCAT(standard, ' Standard') LIKE ?) AND deleted_at IS NULL`,
      [standard, `%${standard}%`, `%${standard}%`]
    );

    // Fetch statuses for this homework
    const [statuses] = await db.query(
      "SELECT student_id, status, feedback FROM homework_status WHERE homework_id = ?",
      [homeworkId]
    );

    const statusMap = {};
    statuses.forEach(s => {
      statusMap[s.student_id] = { status: s.status, feedback: s.feedback };
    });

    const result = students.map(student => ({
      ...student,
      status: statusMap[student.id]?.status || "Pending",
      feedback: statusMap[student.id]?.feedback || ""
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Get Homework Students Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 8. GET ALL HOMEWORKS FOR ADMIN ─────────────────────
exports.getAllHomeworkAdmin = async (req, res) => {
  try {
    const [homeworks] = await db.query(
      `SELECT h.*, t.name as teacher_name,
       (SELECT COUNT(DISTINCT student_id) FROM homework_status WHERE homework_id = h.id AND status = 'Completed') as completed_count,
       (SELECT COUNT(DISTINCT student_id) FROM homework_status WHERE homework_id = h.id AND status = 'Late') as late_count
       FROM homework h
       JOIN teachers t ON h.teacher_id = t.id
       WHERE h.is_deleted = FALSE
       ORDER BY h.created_at DESC`
    );

    const result = [];
    for (const h of homeworks) {
      const stdMatch = h.batch.match(/\d+/);
      const standard = stdMatch ? stdMatch[0] : h.batch;

      // Find total active students in this standard
      const [studentRows] = await db.query(
        `SELECT COUNT(id) as total FROM students 
         WHERE (standard = ? OR standard LIKE ? OR CONCAT(standard, ' Standard') LIKE ?) AND deleted_at IS NULL`,
        [standard, `%${standard}%`, `%${standard}%`]
      );
      
      result.push({
        ...h,
        completed_count: h.completed_count || 0,
        late_count: h.late_count || 0,
        total_students: studentRows[0]?.total || 0
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Admin Homework Fetch Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};
