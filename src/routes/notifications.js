const express = require("express");
const router = express.Router();
const notificationService = require("../services/notificationService");
const { protect, authorize } = require("../middleware/authMiddleware");

/**
 * @route   POST /api/notifications/register-token
 * @desc    Register or update device FCM token for authenticated user
 * @access  Private (Student, Teacher, Admin)
 */
router.post("/register-token", protect, async (req, res, next) => {
  try {
    const { token, deviceType } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Device token is required." });
    }

    const userId = req.user.id;
    const userRole = req.user.role || "STUDENT";

    await notificationService.registerToken(userId, userRole, token, deviceType || "web");

    res.json({
      success: true,
      message: "Device push token registered successfully.",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/send-single
 * @desc    Send push notification to a specific user
 * @access  Private (Admin only)
 */
router.post("/send-single", protect, authorize(["ADMIN", "admin"]), async (req, res, next) => {
  try {
    const { userId, userRole, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: "userId, title, and body are required.",
      });
    }

    const targetRole = userRole || "STUDENT";
    const result = await notificationService.sendToUser(
      userId,
      targetRole,
      title,
      body,
      req.user.id,
      req.user.role || "ADMIN",
      data || {}
    );

    res.json({
      success: true,
      message: "Push alert transmitted successfully to user.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/send-bulk
 * @desc    Send push notification in bulk (all students or all teachers)
 * @access  Private (Admin only)
 */
router.post("/send-bulk", protect, authorize(["ADMIN", "admin"]), async (req, res, next) => {
  try {
    const { title, body, targetRole, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required for push notification.",
      });
    }

    const roleToTarget = targetRole || "STUDENT";
    const result = await notificationService.sendBulk(
      roleToTarget,
      title,
      body,
      req.user.id,
      req.user.role || "ADMIN",
      data || {}
    );

    res.json({
      success: true,
      message: "Bulk push notification broadcast completed.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/send-filtered
 * @desc    Send push notification to custom filtered user list
 * @access  Private (Admin only)
 */
router.post("/send-filtered", protect, authorize(["ADMIN", "admin"]), async (req, res, next) => {
  try {
    const { title, body, filters, data } = req.body;

    if (!title || !body || !filters) {
      return res.status(400).json({
        success: false,
        message: "Title, body, and filters are required.",
      });
    }

    const result = await notificationService.sendFiltered(
      title,
      body,
      filters,
      req.user.id,
      req.user.role || "ADMIN",
      data || {}
    );

    res.json({
      success: true,
      message: "Filtered push notification broadcast completed.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/history
 * @desc    Get notification audit log history
 * @access  Private (Admin only)
 */
router.get("/history", protect, authorize(["ADMIN", "admin"]), async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const history = await notificationService.getHistory(limit, offset);

    res.json({
      success: true,
      data: history.data,
      total: history.total,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
