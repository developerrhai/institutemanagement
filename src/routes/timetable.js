const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth"); // for Admin
const { protect, authorize } = require("../middleware/authMiddleware"); // for Teacher/Student

const c = require("../controllers/timetableController");

// Admin Routes (using auth.js)
router.get("/batches", auth, c.getBatches);
router.get("/:batch/:year/:month", auth, c.getMonth);
router.post("/config", auth, c.saveConfig);
router.post("/entry", auth, c.saveEntry);
router.put("/entry/:id", auth, c.updateEntry);
router.delete("/entry/:id", auth, c.deleteEntry);
router.post("/copy-month", auth, c.copyMonth);

// View Routes (Shared: Teacher/Student/Admin)
router.get("/view/:batch/:year/:month", protect, authorize(["ADMIN", "TEACHER", "STUDENT"]), c.viewMonth);

module.exports = router;
