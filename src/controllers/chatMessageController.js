const db = require("../config/db");

// ── 1. GET MESSAGE HISTORY ─────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { id: userId, role } = req.user;
    const { page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Check membership unless admin
    if (role !== 'ADMIN') {
      const [membership] = await db.query(
        `SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND user_role = ? AND removed_at IS NULL`,
        [groupId, userId, role]
      );
      if (membership.length === 0) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    // Fetch messages (newest first, but we usually display oldest first, so frontend handles reverse)
    const [messages] = await db.query(
      `SELECT id, group_id, sender_id, sender_role, sender_name, message_text, created_at 
       FROM chat_messages 
       WHERE group_id = ? AND is_deleted = FALSE 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [groupId, parseInt(limit), offset]
    );

    res.json({ success: true, data: messages });
  } catch (err) {
    console.error("Get Messages Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// NOTE: Creating messages is primarily handled via Socket.io to ensure real-time broadcast.
// If a REST fallback is needed, it would look like this:
exports.createMessage = async (req, res) => {
  try {
    const { groupId, messageText } = req.body;
    const { id: userId, role, name } = req.user;

    // Check membership
    const [membership] = await db.query(
      `SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND user_role = ? AND removed_at IS NULL`,
      [groupId, userId, role]
    );
    if (membership.length === 0) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const [result] = await db.query(
      `INSERT INTO chat_messages (group_id, sender_id, sender_role, sender_name, message_text) 
       VALUES (?, ?, ?, ?, ?)`,
      [groupId, userId, role, name || 'Unknown', messageText]
    );

    res.status(201).json({ success: true, message: "Message sent", data: { id: result.insertId } });
  } catch (err) {
    console.error("Create Message Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};
