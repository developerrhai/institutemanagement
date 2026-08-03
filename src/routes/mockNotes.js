const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const db = require("../config/db"); // MySQL DB connection

const dbPath = path.join(__dirname, "../db/mock_notes_db.json");

// Default initial seeded data
const initialData = {
  branches: [
    { branch_id: 1, branch_name: "Chinchwad" },
    { branch_id: 2, branch_name: "Wakad" },
    { branch_id: 3, branch_name: "Thergaon" }
  ],
  batches: [
    { batch_id: 1, branch_id: 1, batch_name: "Morning Batch (7AM – 9AM)", start_time: "07:00:00", end_time: "09:00:00", batch_start_date: "2026-01-01", batch_end_date: "2026-12-31" },
    { batch_id: 2, branch_id: 1, batch_name: "Evening Batch (5PM – 7PM)", start_time: "17:00:00", end_time: "19:00:00", batch_start_date: "2026-01-01", batch_end_date: "2026-12-31" }
  ],
  boards: [
    { board_id: 1, name: "CBSE" },
    { board_id: 2, name: "ICSE" }
  ],
  standards: [
    { stand_id: 1, board_id: 1, batch_id: 1, branch_id: 1, name: "10th Standard" },
    { stand_id: 2, board_id: 1, batch_id: 1, branch_id: 1, name: "12th Standard" }
  ],
  subjects: [
    { sub_id: 1, stand_id: 1, branch_id: 1, batch_id: 1, board_id: 1, name: "Physics", teacher_name: "Dr. Anil Mehta" },
    { sub_id: 2, stand_id: 1, branch_id: 1, batch_id: 1, board_id: 1, name: "Chemistry", teacher_name: "Mrs. Sunita Rao" }
  ],
  chapters: [
    { chap_id: 1, sub_id: 1, stand_id: 1, branch_id: 1, batch_id: 1, board_id: 1, name: "Laws of Motion", description: "Newton's laws and mechanics.", topics: [{ name: "First Law", start_date: "2026-06-01", end_date: "2026-06-05" }] }
  ],
  notes: [
    { note_id: 1, chap_id: 1, sub_id: 1, stand_id: 1, branch_id: 1, batch_id: 1, board_id: 1, title: "Laws of Motion Revision PDF", file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" }
  ]
};

function readDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const content = fs.readFileSync(dbPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading mock DB:", err);
    return initialData;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing mock DB:", err);
  }
}

// ── GET and POST /branches ──
router.get("/branches", (req, res) => {
  const dbData = readDb();
  res.json({ success: true, branches: dbData.branches, data: { branches: dbData.branches } });
});
router.post("/branches", (req, res) => {
  const { branch_name } = req.body;
  if (!branch_name) return res.status(400).json({ success: false, message: "Branch name is required" });
  const dbData = readDb();
  const newBranch = { branch_id: Date.now(), branch_name };
  dbData.branches.push(newBranch);
  writeDb(dbData);
  res.json({ success: true, message: "Branch created successfully", data: newBranch });
});

// ── GET and POST /batches ──
router.get("/batches/:branch_id", (req, res) => {
  const branch_id = Number(req.params.branch_id);
  const dbData = readDb();
  const filtered = dbData.batches.filter(b => Number(b.branch_id) === branch_id);
  res.json({ success: true, data: filtered });
});
router.post("/batches", (req, res) => {
  const { branch_id, batch_name, start_time, end_time, batch_start_date, batch_end_date } = req.body;
  if (!branch_id || !batch_name) return res.status(400).json({ success: false, message: "Required fields missing" });
  const dbData = readDb();
  const newBatch = {
    batch_id: Date.now(),
    branch_id: Number(branch_id),
    batch_name,
    start_time: start_time || "09:00:00",
    end_time: end_time || "11:00:00",
    batch_start_date: batch_start_date || "2026-01-01",
    batch_end_date: batch_end_date || "2026-12-31"
  };
  dbData.batches.push(newBatch);
  writeDb(dbData);
  res.json({ success: true, message: "Batch created successfully", data: newBatch });
});

// ── GET and POST /boards ──
router.get("/boards", (req, res) => {
  const dbData = readDb();
  res.json({ success: true, data: dbData.boards });
});
router.post("/boards", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Name is required" });
  const dbData = readDb();
  const newBoard = { board_id: Date.now(), name };
  dbData.boards.push(newBoard);
  writeDb(dbData);
  res.json({ success: true, message: "Board created successfully", data: newBoard });
});

// ── GET and POST /standards ──
router.get("/standards/filter", (req, res) => {
  const { board_id, batch_id, branch_id } = req.query;
  const dbData = readDb();
  const filtered = dbData.standards.filter(s => 
    (!board_id || Number(s.board_id) === Number(board_id)) &&
    (!batch_id || Number(s.batch_id) === Number(batch_id)) &&
    (!branch_id || Number(s.branch_id) === Number(branch_id))
  );
  res.json({ success: true, data: filtered });
});
router.post("/standards", (req, res) => {
  const { board_id, batch_id, branch_id, name } = req.body;
  if (!board_id || !batch_id || !name) return res.status(400).json({ success: false, message: "Required fields missing" });
  const dbData = readDb();
  const newStandard = {
    stand_id: Date.now(),
    board_id: Number(board_id),
    batch_id: Number(batch_id),
    branch_id: Number(branch_id || 1),
    name
  };
  dbData.standards.push(newStandard);
  writeDb(dbData);
  res.json({ success: true, message: "Standard created successfully", data: newStandard });
});

// ── GET and POST /subjects ──
router.get("/subjects/filter", (req, res) => {
  const { stand_id, branch_id, batch_id, board_id } = req.query;
  const dbData = readDb();
  const filtered = dbData.subjects.filter(s =>
    (!stand_id || Number(s.stand_id) === Number(stand_id)) &&
    (!branch_id || Number(s.branch_id) === Number(branch_id)) &&
    (!batch_id || Number(s.batch_id) === Number(batch_id)) &&
    (!board_id || Number(s.board_id) === Number(board_id))
  );
  res.json({ success: true, data: filtered });
});
router.post("/subjects", (req, res) => {
  const { stand_id, branch_id, batch_id, board_id, name, teacher_id } = req.body;
  if (!stand_id || !name) return res.status(400).json({ success: false, message: "Required fields missing" });
  const dbData = readDb();
  const newSubject = {
    sub_id: Date.now(),
    stand_id: Number(stand_id),
    branch_id: Number(branch_id || 1),
    batch_id: Number(batch_id || 1),
    board_id: Number(board_id || 1),
    name,
    teacher_name: teacher_id ? "Assigned Teacher" : "No teacher assigned"
  };
  dbData.subjects.push(newSubject);
  writeDb(dbData);
  res.json({ success: true, message: "Subject created successfully", data: newSubject });
});

// ── GET and POST /chapters ──
router.get("/chapters/filter", (req, res) => {
  const { sub_id } = req.query;
  const dbData = readDb();
  const filtered = dbData.chapters.filter(c =>
    (!sub_id || Number(c.sub_id) === Number(sub_id))
  );
  res.json({ success: true, data: filtered });
});
router.post("/chapters", (req, res) => {
  const { sub_id, name, description, topics } = req.body;
  if (!sub_id || !name) return res.status(400).json({ success: false, message: "Required fields missing" });
  const dbData = readDb();
  const newChapter = {
    chap_id: Date.now(),
    sub_id: Number(sub_id),
    name,
    description: description || "",
    topics: topics || []
  };
  dbData.chapters.push(newChapter);
  writeDb(dbData);
  res.json({ success: true, message: "Chapter created successfully", data: newChapter });
});

// ── GET and POST /notes ──
router.get("/notes/filter", (req, res) => {
  const { chap_id } = req.query;
  const dbData = readDb();
  const filtered = dbData.notes.filter(n =>
    (!chap_id || Number(n.chap_id) === Number(chap_id))
  );
  res.json({ success: true, data: filtered });
});
router.post("/notes", (req, res) => {
  const { chap_id, title, file_url } = req.body;
  if (!chap_id || !title || !file_url) return res.status(400).json({ success: false, message: "Required fields missing" });
  const dbData = readDb();
  const newNote = {
    note_id: Date.now(),
    chap_id: Number(chap_id),
    title,
    file_url
  };
  dbData.notes.push(newNote);
  writeDb(dbData);
  res.json({ success: true, message: "Note created successfully", data: newNote });
});

// ── GET /students-universal ──
router.get("/students-universal", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM students");
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── In-memory store for assessments (since the table doesn't exist in local DB) ──
let assessments = [
  { id: 1, student_id: 1, subject: "Physics", marks: 85, total_marks: 100, examination: "Unit Test 1", exam_date: "2026-06-10" },
  { id: 2, student_id: 2, subject: "Chemistry", marks: 90, total_marks: 100, examination: "Unit Test 1", exam_date: "2026-06-10" }
];

// ── GET and POST /teacher-student-assessments ──
router.get("/teacher-student-assessments", (req, res) => {
  res.json({ success: true, data: assessments });
});

router.get("/teacher-student-assessments/:studentId", (req, res) => {
  const studentId = Number(req.params.studentId);
  const filtered = assessments.filter(a => Number(a.student_id) === studentId);
  res.json({ success: true, data: filtered });
});

router.post("/teacher-student-assessments/:studentId", (req, res) => {
  const studentId = Number(req.params.studentId);
  const { subject, marks, total_marks, examination, exam_date } = req.body;
  const newAssessment = {
    id: assessments.length + 1,
    student_id: studentId,
    subject: subject || "Physics",
    marks: Number(marks) || 0,
    total_marks: Number(total_marks) || 100,
    examination: examination || "Unit Test",
    exam_date: exam_date || new Date().toISOString().split("T")[0]
  };
  assessments.push(newAssessment);
  res.json({ success: true, message: "Assessment created successfully", data: newAssessment });
});

module.exports = router;
