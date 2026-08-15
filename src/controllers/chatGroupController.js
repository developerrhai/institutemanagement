const db = require("../config/db");

// ── 1. CREATE GROUP ────────────────────────────────────
exports.createGroup = async (req, res) => {
  try {
    const { name, description, memberIds } = req.body;
    const { id: adminId } = req.user;

    if (!name) {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    const [result] = await db.query(
      `INSERT INTO chat_groups (name, description, created_by) VALUES (?, ?, ?)`,
      [name, description || "", adminId]
    );

    const groupId = result.insertId;

    // Admin who creates the group is automatically added
    let membersToInsert = [
      [groupId, adminId, 'ADMIN']
    ];

    if (memberIds && Array.isArray(memberIds)) {
       for (const member of memberIds) {
         if (member.id && member.role) {
            membersToInsert.push([groupId, member.id, member.role.toUpperCase()]);
         }
       }
    }

    if (membersToInsert.length > 0) {
        await db.query(
            `INSERT IGNORE INTO chat_group_members (group_id, user_id, user_role) VALUES ?`,
            [membersToInsert]
        );
    }

    res.status(201).json({ success: true, message: "Group created successfully", data: { groupId } });
  } catch (err) {
    console.error("Create Chat Group Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 2. GET ALL GROUPS (ADMIN) ──────────────────────────
exports.getAllGroups = async (req, res) => {
  try {
    const [groups] = await db.query(
      `SELECT g.*, 
       (SELECT COUNT(id) FROM chat_group_members WHERE group_id = g.id AND removed_at IS NULL) as member_count 
       FROM chat_groups g 
       WHERE g.is_deleted = FALSE 
       ORDER BY g.created_at DESC`
    );

    res.json({ success: true, data: groups });
  } catch (err) {
    console.error("Get All Groups Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 3. GET MY GROUPS ───────────────────────────────────
exports.getMyGroups = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    const [groups] = await db.query(
      `SELECT g.id, g.name, g.description, g.created_at, m.user_role 
       FROM chat_groups g
       JOIN chat_group_members m ON g.id = m.group_id
       WHERE m.user_id = ? AND m.user_role = ? AND m.removed_at IS NULL AND g.is_deleted = FALSE
       ORDER BY g.created_at DESC`,
      [userId, role]
    );

    res.json({ success: true, data: groups });
  } catch (err) {
    console.error("Get My Groups Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 4. GET GROUP DETAILS & MEMBERS ─────────────────────
exports.getGroupDetails = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { id: userId, role } = req.user;

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

    const [groupRows] = await db.query(`SELECT * FROM chat_groups WHERE id = ? AND is_deleted = FALSE`, [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const [members] = await db.query(
      `SELECT user_id, user_role, joined_at FROM chat_group_members WHERE group_id = ? AND removed_at IS NULL`,
      [groupId]
    );

    // Fetch names for members (Since they come from different tables, we'll do quick lookups)
    for (let member of members) {
      let table = 'students';
      if (member.user_role === 'ADMIN') table = 'admins';
      else if (member.user_role === 'TEACHER') table = 'teachers';

      const [userRows] = await db.query(`SELECT name FROM ?? WHERE id = ?`, [table, member.user_id]);
      member.name = userRows[0]?.name || 'Unknown';
    }

    res.json({ success: true, data: { ...groupRows[0], members } });
  } catch (err) {
    console.error("Get Group Details Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 5. ADD MEMBERS ─────────────────────────────────────
exports.addMembers = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { members } = req.body; // Array: [{id, role}]

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, message: "Members array is required" });
    }

    let membersToInsert = [];
    for (const member of members) {
        if (member.id && member.role) {
            membersToInsert.push([groupId, member.id, member.role.toUpperCase()]);
        }
    }

    if (membersToInsert.length > 0) {
        await db.query(
            `INSERT INTO chat_group_members (group_id, user_id, user_role) 
             VALUES ? 
             ON DUPLICATE KEY UPDATE removed_at = NULL`,
            [membersToInsert]
        );
    }

    res.json({ success: true, message: "Members added successfully" });
  } catch (err) {
    console.error("Add Members Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 6. REMOVE MEMBER ───────────────────────────────────
exports.removeMember = async (req, res) => {
  try {
    const { id: groupId, userId } = req.params;

    await db.query(
      `UPDATE chat_group_members SET removed_at = NOW() WHERE group_id = ? AND user_id = ?`,
      [groupId, userId]
    );

    res.json({ success: true, message: "Member removed successfully" });
  } catch (err) {
    console.error("Remove Member Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};

// ── 7. DELETE GROUP ────────────────────────────────────
exports.deleteGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;

    await db.query(`UPDATE chat_groups SET is_deleted = TRUE WHERE id = ?`, [groupId]);

    res.json({ success: true, message: "Group deleted successfully" });
  } catch (err) {
    console.error("Delete Group Error:", err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
};
