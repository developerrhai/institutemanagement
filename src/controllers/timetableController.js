const db = require("../config/db");

// Auto-initialize tables on module load
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS timetable_configs (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        admin_id      INT UNSIGNED NOT NULL,
        batch         VARCHAR(100) NOT NULL,
        month         TINYINT NOT NULL,
        year          SMALLINT NOT NULL,
        day_of_week   TINYINT NOT NULL,
        subject       VARCHAR(100) NOT NULL DEFAULT '',
        color_code    VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_config (admin_id, batch, year, month, day_of_week)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS timetable_entries (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        admin_id      INT UNSIGNED NOT NULL,
        batch         VARCHAR(100) NOT NULL,
        entry_date    DATE NOT NULL,
        subject       VARCHAR(100) DEFAULT '',
        topic         VARCHAR(255) DEFAULT '',
        entry_type    ENUM('class','test','holiday','off') DEFAULT 'class',
        test_subject  VARCHAR(100) DEFAULT '',
        note          TEXT DEFAULT NULL,
        color_override VARCHAR(7) DEFAULT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_entry (admin_id, batch, entry_date),
        INDEX idx_batch_month (batch, entry_date)
      )
    `);
    console.log("Timetable tables verified.");
  } catch (err) {
    console.error("Timetable table init error:", err);
  }
})();

// Get Month Data (Admin)
exports.getMonth = async (req, res) => {
  try {
    const { batch, year, month } = req.params;
    const adminId = req.admin.id;

    const [configs] = await db.query(
      "SELECT * FROM timetable_configs WHERE admin_id=? AND batch=? AND year=? AND month=?",
      [adminId, batch, year, month]
    );

    const [entries] = await db.query(
      "SELECT * FROM timetable_entries WHERE admin_id=? AND batch=? AND YEAR(entry_date)=? AND MONTH(entry_date)=?",
      [adminId, batch, year, month]
    );

    res.json({ success: true, data: { config: configs, entries: entries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// View Month Data (Read-only for all)
exports.viewMonth = async (req, res) => {
  try {
    const { batch, year, month } = req.params;
    const adminId = req.user.role === 'ADMIN' ? req.user.id : req.user.admin_id;
    
    // Filter by admin_id to prevent multi-tenant data leak
    const [configs] = await db.query(
      "SELECT * FROM timetable_configs WHERE admin_id=? AND batch=? AND year=? AND month=?",
      [adminId, batch, year, month]
    );

    const [entries] = await db.query(
      "SELECT * FROM timetable_entries WHERE admin_id=? AND batch=? AND YEAR(entry_date)=? AND MONTH(entry_date)=?",
      [adminId, batch, year, month]
    );

    res.json({ success: true, data: { config: configs, entries: entries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { batch, month, year, day_of_week, subject, color_code } = req.body;
    const adminId = req.admin.id;

    const [result] = await db.query(
      `INSERT INTO timetable_configs (admin_id, batch, month, year, day_of_week, subject, color_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE subject=VALUES(subject), color_code=VALUES(color_code)`,
      [adminId, batch, month, year, day_of_week, subject, color_code]
    );
    res.json({ success: true, message: "Config saved" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveEntry = async (req, res) => {
  try {
    const { batch, entry_date, subject, topic, entry_type, test_subject, note, color_override } = req.body;
    const adminId = req.admin.id;

    await db.query(
      `INSERT INTO timetable_entries (admin_id, batch, entry_date, subject, topic, entry_type, test_subject, note, color_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         subject=VALUES(subject), topic=VALUES(topic), entry_type=VALUES(entry_type), 
         test_subject=VALUES(test_subject), note=VALUES(note), color_override=VALUES(color_override)`,
      [adminId, batch, entry_date, subject || '', topic || '', entry_type || 'class', test_subject || '', note || '', color_override || null]
    );
    res.json({ success: true, message: "Entry saved" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, topic, entry_type, test_subject, note, color_override } = req.body;
    const adminId = req.admin.id;

    await db.query(
      `UPDATE timetable_entries SET subject=?, topic=?, entry_type=?, test_subject=?, note=?, color_override=?
       WHERE id=? AND admin_id=?`,
      [subject || '', topic || '', entry_type || 'class', test_subject || '', note || '', color_override || null, id, adminId]
    );
    res.json({ success: true, message: "Entry updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    await db.query("DELETE FROM timetable_entries WHERE id=? AND admin_id=?", [id, adminId]);
    res.json({ success: true, message: "Entry deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBatches = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const [rows] = await db.query(
      "SELECT DISTINCT batch_name as name FROM batches ORDER BY batch_name"
    );
    res.json({ success: true, data: rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Core logic: Copy month config and entries
exports.copyMonth = async (req, res) => {
  try {
    const { batch, sourceMonth, sourceYear, targetMonth, targetYear } = req.body;
    const adminId = req.admin.id;

    // 1. Copy config
    await db.query(
      `INSERT INTO timetable_configs (admin_id, batch, month, year, day_of_week, subject, color_code)
       SELECT admin_id, batch, ?, ?, day_of_week, subject, color_code
       FROM timetable_configs WHERE admin_id=? AND batch=? AND month=? AND year=?
       ON DUPLICATE KEY UPDATE subject=VALUES(subject), color_code=VALUES(color_code)`,
      [targetMonth, targetYear, adminId, batch, sourceMonth, sourceYear]
    );

    // 2. Map entries
    const [sourceEntries] = await db.query(
      "SELECT * FROM timetable_entries WHERE admin_id=? AND batch=? AND YEAR(entry_date)=? AND MONTH(entry_date)=?",
      [adminId, batch, sourceYear, sourceMonth]
    );

    const map = {};
    for (let i = 0; i < 7; i++) map[i] = [];

    // Group by weekday and index
    sourceEntries.forEach(entry => {
      // only copy classes and tests, skip holidays and off days 
      if (entry.entry_type === 'holiday' || entry.entry_type === 'off') return;
      const d = new Date(entry.entry_date);
      const dayOfWeek = d.getUTCDay();
      
      const dateNum = d.getUTCDate();
      const weekIndex = Math.floor((dateNum - 1) / 7);
      
      map[dayOfWeek][weekIndex] = entry;
    });

    // Generate target month dates
    const daysInTarget = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    let skipped = 0;
    let copied = 0;

    for (let day = 1; day <= daysInTarget; day++) {
      const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, day));
      const dayOfWeek = targetDate.getUTCDay();
      const weekIndex = Math.floor((day - 1) / 7);

      const sourceEntry = map[dayOfWeek][weekIndex];
      if (sourceEntry) {
        // Insert it
        await db.query(
          `INSERT INTO timetable_entries (admin_id, batch, entry_date, subject, topic, entry_type, test_subject, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE topic=VALUES(topic), entry_type=VALUES(entry_type), test_subject=VALUES(test_subject)`,
          [
            adminId, batch, targetDate.toISOString().split('T')[0],
            sourceEntry.subject, sourceEntry.topic, sourceEntry.entry_type, sourceEntry.test_subject, sourceEntry.note
          ]
        );
        copied++;
      }
    }

    // Identify if any source entries couldn't fit
    let totalSourceValid = 0;
    for (let i = 0; i < 7; i++) {
      totalSourceValid += map[i].filter(Boolean).length;
    }
    skipped = totalSourceValid - copied;

    res.json({ success: true, message: `Copied ${copied} entries. Skipped ${skipped} overflow entries.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
