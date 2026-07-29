const pool = require("../config/db");
const { admin } = require("../config/firebase");
const crypto = require("crypto");

class NotificationService {
  /**
   * Save or update an FCM token for a user.
   */
  async registerToken(userId, userRole = "STUDENT", token, deviceType = "web") {
    const formattedRole = (userRole || "STUDENT").toUpperCase();

    // Check if token already exists for this user & role
    const [existing] = await pool.query(
      "SELECT id FROM fcm_tokens WHERE user_id = ? AND user_role = ? AND token = ?",
      [userId, formattedRole, token]
    );

    if (existing.length > 0) {
      // Update last active timestamp
      await pool.query(
        "UPDATE fcm_tokens SET last_active = CURRENT_TIMESTAMP WHERE id = ?",
        [existing[0].id]
      );
      return;
    }

    // Delete token if it was previously registered to another user (device transfer)
    await pool.query("DELETE FROM fcm_tokens WHERE token = ?", [token]);

    // Insert new token
    const publicId = "notif_tok_" + crypto.randomBytes(12).toString("hex");
    await pool.query(
      "INSERT INTO fcm_tokens (public_id, user_id, user_role, token, device_type) VALUES (?, ?, ?, ?, ?)",
      [publicId, userId, formattedRole, token, deviceType]
    );
  }

  /**
   * Internal method to log the notification to DB.
   */
  async _logNotification(
    title,
    body,
    targetType,
    targetRole = "STUDENT",
    targetCriteria = null,
    sentBy = null,
    sentByRole = "ADMIN",
    successCount = 0,
    failureCount = 0,
    status = "sent"
  ) {
    const publicId = "notif_" + crypto.randomBytes(12).toString("hex");
    const criteriaJson = targetCriteria ? JSON.stringify(targetCriteria) : null;

    await pool.query(
      `INSERT INTO notifications 
      (public_id, title, body, target_type, target_role, target_criteria, sent_by, sent_by_role, success_count, failure_count, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        publicId,
        title,
        body,
        targetType,
        targetRole,
        criteriaJson,
        sentBy,
        sentByRole,
        successCount,
        failureCount,
        status,
      ]
    );
    return publicId;
  }

  /**
   * Send notification to a single user.
   */
  async sendToUser(userId, userRole = "STUDENT", title, body, sentBy = null, sentByRole = "ADMIN", data = {}) {
    const formattedRole = (userRole || "STUDENT").toUpperCase();

    const [tokens] = await pool.query(
      "SELECT token FROM fcm_tokens WHERE user_id = ? AND user_role = ?",
      [userId, formattedRole]
    );

    if (tokens.length === 0) {
      await this._logNotification(
        title,
        body,
        "single",
        formattedRole,
        { userId, userRole: formattedRole },
        sentBy,
        sentByRole,
        0,
        1,
        "failed"
      );
      throw new Error(`No registered devices found for ${formattedRole} (ID: ${userId}).`);
    }

    const deviceTokens = tokens.map((t) => t.token);

    return await this._processMulticast(
      deviceTokens,
      title,
      body,
      "single",
      formattedRole,
      { userId, userRole: formattedRole },
      sentBy,
      sentByRole,
      data
    );
  }

  /**
   * Send bulk notification by role (STUDENT, TEACHER, ALL).
   */
  async sendBulk(targetRole = "STUDENT", title, body, sentBy = null, sentByRole = "ADMIN", data = {}) {
    const formattedRole = (targetRole || "STUDENT").toUpperCase();

    let sql = "SELECT f.token FROM fcm_tokens f";
    const params = [];

    if (formattedRole === "STUDENT") {
      sql += ` JOIN students s ON f.user_id = s.id WHERE f.user_role = 'STUDENT' AND s.deleted_at IS NULL`;
    } else if (formattedRole === "TEACHER") {
      sql += ` JOIN teachers t ON f.user_id = t.id WHERE f.user_role = 'TEACHER'`;
    } else if (formattedRole === "ADMIN") {
      sql += ` JOIN admins a ON f.user_id = a.id WHERE f.user_role = 'ADMIN'`;
    }

    const [rows] = await pool.query(sql, params);

    if (rows.length === 0) {
      await this._logNotification(
        title,
        body,
        "bulk",
        formattedRole,
        { targetRole: formattedRole },
        sentBy,
        sentByRole,
        0,
        0,
        "sent"
      );
      return { successCount: 0, failureCount: 0, message: `No active ${formattedRole} devices found.` };
    }

    return await this._processMulticast(
      rows.map((r) => r.token),
      title,
      body,
      "bulk",
      formattedRole,
      { targetRole: formattedRole },
      sentBy,
      sentByRole,
      data
    );
  }

  /**
   * Send filtered notification (e.g. specific array of userIds and userRole).
   */
  async sendFiltered(title, body, filters = {}, sentBy = null, sentByRole = "ADMIN", data = {}) {
    const userIds = filters.userIds || [];
    const targetRole = (filters.targetRole || "STUDENT").toUpperCase();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("Filtered targeting requires an array of userIds.");
    }

    const [rows] = await pool.query(
      "SELECT token FROM fcm_tokens WHERE user_role = ? AND user_id IN (?)",
      [targetRole, userIds]
    );

    if (rows.length === 0) {
      await this._logNotification(title, body, "filtered", targetRole, filters, sentBy, sentByRole, 0, 0, "sent");
      return { successCount: 0, failureCount: 0, message: "No registered device tokens matched the filter criteria." };
    }

    return await this._processMulticast(
      rows.map((r) => r.token),
      title,
      body,
      "filtered",
      targetRole,
      filters,
      sentBy,
      sentByRole,
      data
    );
  }

  /**
   * Helper to batch and send multicast messages in FCM (500 per batch limit).
   */
  async _processMulticast(tokens, title, body, targetType, targetRole, targetCriteria, sentBy, sentByRole, data) {
    let successCount = 0;
    let failureCount = 0;
    const failedTokens = [];

    const BATCH_SIZE = 500;
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batchTokens = tokens.slice(i, i + BATCH_SIZE);
      const message = {
        notification: { title, body },
        data: data || {},
        tokens: batchTokens,
      };

      try {
        if (admin && typeof admin.messaging === "function") {
          const response = await admin.messaging().sendMulticast(message);
          successCount += response.successCount;
          failureCount += response.failureCount;

          if (response.failureCount > 0 && response.responses) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                failedTokens.push(batchTokens[idx]);
              }
            });
          }
        } else {
          throw new Error("Firebase Admin SDK messaging function unavailable.");
        }
      } catch (err) {
        console.error("FCM Multicast Transmission Error:", err);
        failureCount += batchTokens.length;
      }
    }

    // Clean up stale or failed tokens
    if (failedTokens.length > 0) {
      try {
        await pool.query("DELETE FROM fcm_tokens WHERE token IN (?)", [failedTokens]);
      } catch (cleanErr) {
        console.warn("Could not purge failed FCM tokens:", cleanErr.message);
      }
    }

    const status = failureCount > 0 && successCount === 0 ? "failed" : "sent";
    await this._logNotification(
      title,
      body,
      targetType,
      targetRole,
      targetCriteria,
      sentBy,
      sentByRole,
      successCount,
      failureCount,
      status
    );

    return { successCount, failureCount };
  }

  /**
   * Get notification audit log history (Admin).
   */
  async getHistory(limit = 50, offset = 0) {
    const numericLimit = parseInt(limit) || 50;
    const numericOffset = parseInt(offset) || 0;

    const [rows] = await pool.query(
      `SELECT n.*, a.name as sent_by_name
       FROM notifications n
       LEFT JOIN admins a ON n.sent_by = a.id
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [numericLimit, numericOffset]
    );

    const [countResult] = await pool.query("SELECT COUNT(id) as total FROM notifications");
    const total = countResult[0]?.total || 0;

    return {
      data: rows,
      total,
    };
  }
}

module.exports = new NotificationService();
