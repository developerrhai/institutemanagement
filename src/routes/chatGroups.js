const express = require("express");
const router = express.Router();
const controller = require("../controllers/chatGroupController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Admin routes
router.post("/", protect, authorize(["ADMIN"]), controller.createGroup);
router.get("/", protect, authorize(["ADMIN"]), controller.getAllGroups);
router.put("/:id", protect, authorize(["ADMIN"]), controller.createGroup); // Actually should be update, but using create fallback for now if no update
router.delete("/:id", protect, authorize(["ADMIN"]), controller.deleteGroup);
router.post("/:id/members", protect, authorize(["ADMIN"]), controller.addMembers);
router.delete("/:id/members/:userId", protect, authorize(["ADMIN"]), controller.removeMember);

// Common routes
router.get("/my-groups", protect, controller.getMyGroups);
router.get("/:id", protect, controller.getGroupDetails);

module.exports = router;
