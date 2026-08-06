const db = require("../config/db");

// Auto-initialize tables on module load
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        admin_id        INT UNSIGNED NOT NULL,
        name            VARCHAR(150) NOT NULL,
        category        ENUM('Clothing','Books','Bags','Stationery','Other') NOT NULL DEFAULT 'Other',
        variant         VARCHAR(100) DEFAULT '',
        total_stock     INT UNSIGNED NOT NULL DEFAULT 0,
        description     TEXT DEFAULT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin    (admin_id),
        INDEX idx_category (admin_id, category)
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_distributions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        admin_id        INT UNSIGNED NOT NULL,
        item_id         INT NOT NULL,
        student_id      INT NOT NULL,
        quantity        INT UNSIGNED NOT NULL DEFAULT 1,
        notes           VARCHAR(500) DEFAULT '',
        distributed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_item_student (item_id, student_id),
        INDEX idx_item      (item_id),
        INDEX idx_student   (student_id),
        INDEX idx_date      (distributed_at),
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
      )
    `);
    console.log("Inventory tables verified.");
  } catch (err) {
    console.error("Inventory table init error:", err);
  }
})();

// 1. GET /items
exports.getItems = async (req, res) => {
  try {
    const { category, search } = req.query;
    const adminId = req.admin.id;
    let sql = `
      SELECT i.*,
        COALESCE(d.distributed_count, 0) AS distributed_count,
        (i.total_stock - COALESCE(d.distributed_count, 0)) AS remaining_stock
      FROM inventory_items i
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS distributed_count
        FROM inventory_distributions
        GROUP BY item_id
      ) d ON d.item_id = i.id
      WHERE i.admin_id = ?
    `;
    const params = [adminId];

    if (category && category !== "All") {
      sql += " AND i.category = ?";
      params.push(category);
    }
    if (search) {
      sql += " AND (i.name LIKE ? OR i.variant LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like);
    }
    sql += " ORDER BY i.created_at DESC";

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. POST /items
exports.createItem = async (req, res) => {
  try {
    const { name, category, variant, total_stock, description } = req.body;
    const adminId = req.admin.id;
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });

    const [result] = await db.query(
      `INSERT INTO inventory_items (admin_id, name, category, variant, total_stock, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, name.trim(), category || 'Other', variant || '', total_stock || 0, description || '']
    );
    res.status(201).json({ success: true, message: "Item created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. PUT /items/:id
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const { name, category, variant, total_stock, description } = req.body;

    // Check existing distributions if total_stock is updated
    if (total_stock !== undefined) {
       const [distRows] = await db.query(
           "SELECT SUM(quantity) as distributed_count FROM inventory_distributions WHERE item_id=? AND admin_id=?",
           [id, adminId]
       );
       const distributed = distRows[0].distributed_count || 0;
       if (total_stock < distributed) {
           return res.status(400).json({ success: false, message: `Cannot reduce stock below ${distributed} already distributed` });
       }
    }

    const [result] = await db.query(
      `UPDATE inventory_items 
       SET name=COALESCE(?, name), category=COALESCE(?, category), variant=COALESCE(?, variant), 
           total_stock=COALESCE(?, total_stock), description=COALESCE(?, description)
       WHERE id=? AND admin_id=?`,
      [name?.trim(), category, variant, total_stock, description, id, adminId]
    );

    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Item not found" });
    res.json({ success: true, message: "Item updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. DELETE /items/:id
exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;

    // Attempt deletion; will fail if ON DELETE RESTRICT prevents it (distributions exist)
    try {
        const [result] = await db.query("DELETE FROM inventory_items WHERE id=? AND admin_id=?", [id, adminId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Item not found" });
        res.json({ success: true, message: "Item deleted" });
    } catch (dbErr) {
        if (dbErr.code === 'ER_ROW_IS_REFERENCED_2' || dbErr.code === 'ER_ROW_IS_REFERENCED') {
             return res.status(400).json({ success: false, message: "Cannot delete item with active distributions. Undo them first." });
        }
        throw dbErr;
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 5. GET /items/summary
exports.getSummary = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const [rows] = await db.query(`
      SELECT 
        COUNT(i.id) AS total_items,
        COALESCE(SUM(i.total_stock), 0) AS total_stock,
        COALESCE(SUM(d.distributed_count), 0) AS total_distributed,
        SUM(CASE WHEN (i.total_stock - COALESCE(d.distributed_count, 0)) < 10 THEN 1 ELSE 0 END) AS low_stock_count
      FROM inventory_items i
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS distributed_count
        FROM inventory_distributions
        GROUP BY item_id
      ) d ON d.item_id = i.id
      WHERE i.admin_id = ?
    `, [adminId]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 6. GET /distributions
exports.getDistributions = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { item_id, student_id, date_from, date_to, search } = req.query;
    
    let sql = `
      SELECT d.*, 
             i.name AS item_name, i.category AS item_category, i.variant,
             s.name AS student_name, s.standard AS student_standard, s.board AS student_board
      FROM inventory_distributions d
      JOIN inventory_items i ON d.item_id = i.id
      LEFT JOIN students s ON d.student_id = s.id
      WHERE d.admin_id = ?
    `;
    const params = [adminId];

    if (item_id) { sql += " AND d.item_id = ?"; params.push(item_id); }
    if (student_id) { sql += " AND d.student_id = ?"; params.push(student_id); }
    if (date_from) { sql += " AND DATE(d.distributed_at) >= ?"; params.push(date_from); }
    if (date_to) { sql += " AND DATE(d.distributed_at) <= ?"; params.push(date_to); }
    if (search) {
       sql += " AND (s.name LIKE ? OR i.name LIKE ?)";
       const like = `%${search}%`;
       params.push(like, like);
    }
    sql += " ORDER BY d.distributed_at DESC";

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 7. POST /distribute
exports.distribute = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const adminId = req.admin.id;
    const { item_id, student_ids, quantity, notes } = req.body;

    if (!item_id || !Array.isArray(student_ids) || student_ids.length === 0) {
      throw new Error("item_id and student_ids array are required");
    }
    const qty = parseInt(quantity) || 1;
    if (qty <= 0) throw new Error("Quantity must be greater than 0");

    // 1. Lock item row and check stock
    const [itemRows] = await connection.query(
      "SELECT total_stock FROM inventory_items WHERE id=? AND admin_id=? FOR UPDATE",
      [item_id, adminId]
    );
    if (!itemRows.length) throw new Error("Item not found");

    const [distRows] = await connection.query(
      "SELECT SUM(quantity) as distributed_count FROM inventory_distributions WHERE item_id=? AND admin_id=?",
      [item_id, adminId]
    );
    const distributed = distRows[0].distributed_count || 0;
    const remaining = itemRows[0].total_stock - distributed;
    
    const requiredQty = qty * student_ids.length;
    if (remaining < requiredQty) {
      throw new Error(`Insufficient stock. Only ${remaining} remaining, but ${requiredQty} requested.`);
    }

    // 2. Insert distributions (ON DUPLICATE KEY UPDATE adds to existing qty)
    let distributedCount = 0;
    for (const sid of student_ids) {
       const [result] = await connection.query(
          `INSERT INTO inventory_distributions (admin_id, item_id, student_id, quantity, notes)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = quantity + ?, notes = VALUES(notes), distributed_at = CURRENT_TIMESTAMP`,
          [adminId, item_id, sid, qty, notes || '', qty]
       );
       distributedCount++;
    }

    await connection.commit();
    res.json({ success: true, message: `Distributed to ${distributedCount} students`, distributed: distributedCount });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
};

// 8. DELETE /distributions/:id
exports.undoDistribution = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;

    const [result] = await db.query("DELETE FROM inventory_distributions WHERE id=? AND admin_id=?", [id, adminId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Distribution not found" });
    
    res.json({ success: true, message: "Distribution undone, stock returned" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 9. GET /student/:studentId/items
exports.getStudentItems = async (req, res) => {
  try {
    const { studentId } = req.params;
    const adminId = req.admin.id;

    const [rows] = await db.query(`
      SELECT d.id as distribution_id, d.quantity, d.notes, d.distributed_at,
             i.name as item_name, i.category as item_category, i.variant
      FROM inventory_distributions d
      JOIN inventory_items i ON d.item_id = i.id
      WHERE d.student_id = ? AND d.admin_id = ?
      ORDER BY d.distributed_at DESC
    `, [studentId, adminId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 10. GET /export/items
exports.exportItems = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const [rows] = await db.query(`
      SELECT i.name, i.category, i.variant, i.total_stock, i.description,
             COALESCE(d.distributed_count, 0) AS distributed_count,
             (i.total_stock - COALESCE(d.distributed_count, 0)) AS remaining_stock
      FROM inventory_items i
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS distributed_count
        FROM inventory_distributions
        GROUP BY item_id
      ) d ON d.item_id = i.id
      WHERE i.admin_id = ?
      ORDER BY i.name ASC
    `, [adminId]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory_items.csv"');
    res.write("\\uFEFF"); // BOM for Excel
    res.write("Name,Category,Variant,Total Stock,Distributed,Remaining,Description\\n");

    const esc = str => (str || '').toString().replace(/"/g, '""');

    for (const r of rows) {
      res.write(`"${esc(r.name)}","${esc(r.category)}","${esc(r.variant)}",${r.total_stock},${r.distributed_count},${r.remaining_stock},"${esc(r.description)}"\n`);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 11. GET /export/distributions
exports.exportDistributions = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { date_from, date_to, item_id } = req.query;

    let sql = `
      SELECT DATE(d.distributed_at) as dist_date, d.quantity, d.notes,
             i.name as item_name, i.category as item_category, i.variant,
             s.name as student_name, s.standard as student_standard, s.board as student_board
      FROM inventory_distributions d
      JOIN inventory_items i ON d.item_id = i.id
      LEFT JOIN students s ON d.student_id = s.id
      WHERE d.admin_id = ?
    `;
    const params = [adminId];

    if (item_id) { sql += " AND d.item_id = ?"; params.push(item_id); }
    if (date_from) { sql += " AND DATE(d.distributed_at) >= ?"; params.push(date_from); }
    if (date_to) { sql += " AND DATE(d.distributed_at) <= ?"; params.push(date_to); }
    sql += " ORDER BY d.distributed_at DESC";

    const [rows] = await db.query(sql, params);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="distribution_history.csv"');
    res.write("\\uFEFF");
    res.write("Date,Student Name,Standard,Board,Item Name,Category,Variant,Quantity,Notes\\n");

    const esc = str => (str || '').toString().replace(/"/g, '""');

    for (const r of rows) {
      const sName = r.student_name ? r.student_name : "Deleted Student";
      const sStd = r.student_standard || "-";
      const sBrd = r.student_board || "-";
      res.write(`"${esc(r.dist_date)}","${esc(sName)}","${esc(sStd)}","${esc(sBrd)}","${esc(r.item_name)}","${esc(r.item_category)}","${esc(r.variant)}",${r.quantity},"${esc(r.notes)}"\n`);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
