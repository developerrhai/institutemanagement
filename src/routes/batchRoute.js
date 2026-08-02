// src/routes/batchRoute.js
const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batchController.js");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize(["ADMIN", "TEACHER"]), batchController.createBatch);
router.get("/:branch_id", protect, authorize(["ADMIN", "TEACHER"]), batchController.getBatchesByBranch);
router.put("/:id", protect, authorize(["ADMIN"]), batchController.updateBatch);
router.delete("/:id", protect, authorize(["ADMIN"]), batchController.deleteBatch);
module.exports = router;
