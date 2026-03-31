require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const morgan  = require("morgan");
const db      = require("./config/db");

const app = express();

/* ── Middleware ─────────────────────────────────────────── */
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(morgan("dev"));

/* ── Routes ─────────────────────────────────────────────── */
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/profile",      require("./routes/profile"));
app.use("/api/students",     require("./routes/students"));
app.use("/api/teachers",     require("./routes/teachers"));
app.use("/api/inquiries",    require("./routes/inquiries"));
app.use("/api/appointments", require("./routes/appointments"));
app.use("/api/invoices",     require("./routes/invoices"));
app.use("/api/finance",      require("./routes/finance"));
app.use("/api/dashboard",    require("./routes/dashboard"));

/* ── Health check ───────────────────────────────────────── */
app.get("/api/health", (_req, res) =>
  res.json({ success: true, message: "InstituteMS API running", ts: new Date() })
);

/* ── 404 handler ────────────────────────────────────────── */
app.use((_req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

/* ── Global error handler ───────────────────────────────── */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || "Internal Server Error" });
});

/* ── Boot ───────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await db.testConnection();
    console.log("✅ MySQL connected");
    app.listen(PORT, () => {
      console.log(`\n🚀 InstituteMS backend  →  http://localhost:${PORT}`);
      console.log(`   ENV : ${process.env.NODE_ENV || "development"}`);
      console.log(`   DB  : ${process.env.DB_NAME}@${process.env.DB_HOST}\n`);
    });
  } catch (err) {
    console.error("❌ Cannot connect to MySQL:", err.message);
    console.error("   Make sure MySQL is running and .env credentials are correct.");
    process.exit(1);
  }
})();
