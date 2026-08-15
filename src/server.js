/* require("dotenv").config(); */
const path = require("path");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const db = require("./config/db");

const app = express();

/* ── Middleware ─────────────────────────────────────────── */
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.endsWith('.vercel.app') || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, process.env.FRONTEND_URL || "https://merit-home.vercel.app");
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Preflight support
app.options("*", cors());

app.use(express.json());
app.use(morgan("dev"));

/* ── Routes ─────────────────────────────────────────────── */

app.use("/api/auth", require("./routes/auth"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/students", require("./routes/students"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/inquiries", require("./routes/inquiries"));
app.use("/api/appointments", require("./routes/appointments"));

app.use("/api/invoices", require("./routes/invoices"));
app.use("/api/finance", require("./routes/finance"));
app.use("/api/dashboard", require("./routes/dashboard"));

app.use("/api/teacher-updates/public", require("./routes/teacherUpdatePublic"));
app.use("/api/admissions/public", require("./routes/admissionPublic"));
app.use("/api/inquiries/public", require("./routes/inquiryPublic"));
app.use("/api/students-universal", require("./routes/studentsUniversal"));

app.use("/api/inquiry-extra", require("./routes/inquiryExtra"));
app.use("/api/teacher-updates", require("./routes/teacherUpdates"));

app.use("/api/teacher-student-assessments", require("./routes/teacherStudentAssessments"));

app.use("/api/subjects", require("./routes/subjects"));
app.use("/api/batches", require("./routes/batchRoute"));
app.use("/api/chapters", require("./routes/chapters"));
app.use("/api/standards", require("./routes/standard"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/boards", require("./routes/boards"));
app.use("/api/branches", require("./routes/branchRoute"));
app.use("/api/assign-teacher", require("./routes/teacherAssignRoute"));
app.use("/api/admin", require("./routes/scheduleRoute"));

/* ── Phase 1 Routes ─────────────────────────────────────── */
app.use("/api/auth/student", require("./routes/studentAuthRoutes"));
app.use("/api/dashboard/student", require("./routes/studentDashboardRoutes"));
app.use("/api/recycle-bin", require("./routes/recycleBinRoutes"));
app.use("/api/homework", require("./routes/homework"));
app.use("/api/teaching-logs", require("./routes/teachingLogs"));
app.use("/api/chat-groups", require("./routes/chatGroups"));
app.use("/api/chat-messages", require("./routes/chatMessages"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/timetable", require("./routes/timetable"));
app.use("/api/inventory", require("./routes/inventory"));

/* ── Health check ───────────────────────────────────────── */
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "InstituteMS API running",
    ts: new Date(),
  });
});

/* ── Root Route ─────────────────────────────────────────── */
app.get("/", (_req, res) => {
  res.send("✅ InstituteMS Backend Running");
});

/* ── 404 handler ────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* ── Global error handler ───────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

/* ── Server Boot ────────────────────────────────────────── */
const PORT = process.env.PORT || 5001;

(async () => {
  try {
    await db.testConnection();

    console.log("✅ MySQL connected");

    // Automatically check/run ALTER TABLE to add OTP columns so the client doesn't have to run migrations manually
    const { ensureOtpColumns } = require("./db/migrate");
    await ensureOtpColumns(db);

    const http = require("http");
    const server = http.createServer(app);

    // Initialize Socket.io
    const socketConfig = require("./config/socket");
    socketConfig.init(server);

    server.listen(PORT, () => {
      console.log(`\n🚀 Backend running → http://localhost:${PORT}`);
      console.log(`ENV : ${process.env.NODE_ENV || "development"}`);
      console.log(`DB  : ${process.env.DB_NAME}@${process.env.DB_HOST}\n`);
    });
  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
    console.error("Check MySQL and .env configuration");

    process.exit(1);
  }
})();