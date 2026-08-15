const db = require("../config/db");

/* GET /api/students?standard=&board=&location=&search= */
exports.getAll = async (req, res) => {
  try {
    const { standard, board, location, search } = req.query;
/*    let sql = "SELECT * FROM students WHERE admin_id = ? OR admin_id = 8";
    const params = [req.admin.id]; */

 let sql = "SELECT * FROM students WHERE 1=1 AND deleted_at IS NULL";
    const params = [];

    if (standard) { sql += " AND standard = ?"; params.push(standard); }
    if (board)     { sql += " AND board LIKE ?"; params.push(`%${board}%`); }
    if (location)  { sql += " AND location = ?"; params.push(location); }
    if (search) {
      sql += " AND (name LIKE ? OR phone LIKE ? OR father_phone LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY created_at DESC";

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/students/:id */
exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM students WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/students */
exports.create = async (req, res) => {
  try {
    const { name, email, phone, father_name, father_phone, board, standard, course, location, institute, fee, paid_fee } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });

    if ((email && email.trim() !== "") || (phone && phone.trim() !== "")) {
      const [existing] = await db.query(
        "SELECT id FROM students WHERE ((email = ? AND email != '') OR (phone = ? AND phone != '')) AND deleted_at IS NULL", 
        [email || 'N/A', phone || 'N/A']
      );
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: "Email or Phone already exists." });
      }
    }

    const phoneLast4 = phone ? phone.slice(-4) : Math.floor(1000 + Math.random() * 9000);
    const plainTextPassword = `Student@${phoneLast4}`;
    
    const bcrypt = require('bcryptjs');
    const { encrypt } = require('../utils/crypto');

    const hashedPassword = await bcrypt.hash(plainTextPassword, 12);
    const encryptedPassword = encrypt(plainTextPassword);

    const [result] = await db.query(
      `INSERT INTO students
         (admin_id,name,email,phone,father_name,father_phone,board,standard,course,location,institute,fee,paid_fee, password, encrypted_password, is_first_login)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?, TRUE)`,
      [req.admin.id, name, email||null, phone||"", father_name||"", father_phone||"",
       board||"", standard||"", course||"", location||"", institute||"", fee||0, paid_fee||0, hashedPassword, encryptedPassword]
    );
    res.status(201).json({ 
      success: true, 
      message: "Student created", 
      id: result.insertId,
      credentials: {
        loginId: email || phone,
        tempPassword: plainTextPassword
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* PUT /api/students/:id */
exports.update = async (req, res) => {
  try {
    const { name, email, phone, father_name, father_phone, board, standard, course, location, institute, fee, paid_fee } = req.body;
    const [result] = await db.query(
      `UPDATE students
       SET name=?,email=?,phone=?,father_name=?,father_phone=?,board=?,standard=?,course=?,location=?,institute=?,fee=?,paid_fee=?
       WHERE id=?`,
      [name, email||null, phone||"", father_name||"", father_phone||"", board||"",
       standard||"", course||"", location||"", institute||"", fee||0, paid_fee||0,
       req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, message: "Student updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* DELETE /api/students/:id */
exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "UPDATE students SET deleted_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, message: "Student deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/students/:id/password */
exports.getStudentPassword = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT phone, encrypted_password FROM students WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    let plainTextPassword;
    if (!rows[0].encrypted_password) {
      const phone = rows[0].phone || "";
      const phoneLast4 = phone.length >= 4 ? phone.slice(-4) : "0000";
      plainTextPassword = `Student@${phoneLast4}`;
    } else {
      const { decrypt } = require('../utils/crypto');
      plainTextPassword = decrypt(rows[0].encrypted_password);
    }
    
    if (!plainTextPassword) {
      // Decryption failed (key mismatch) — fall back to phone-based default
      const phone = rows[0].phone || "";
      const phoneLast4 = phone.length >= 4 ? phone.slice(-4) : "0000";
      const fallback = `Student@${phoneLast4}`;
      return res.json({ 
        success: true, 
        plainTextPassword: fallback,
        warning: "Could not decrypt stored password (encryption key may have changed). Showing default password." 
      });
    }

    res.json({ success: true, plainTextPassword });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* PUT /api/students/:id/password */
exports.adminResetPassword = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT phone FROM students WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Student not found" });

    let newTempPassword = req.body.password;
    if (!newTempPassword) {
      const phone = rows[0].phone || "0000";
      const phoneLast4 = phone.slice(-4);
      newTempPassword = `Reset@${phoneLast4}${Math.floor(10 + Math.random() * 90)}`;
    }
    
    const bcrypt = require("bcryptjs");
    const { encrypt } = require('../utils/crypto');

    const hashedPassword = await bcrypt.hash(newTempPassword, 12);
    const encryptedPassword = encrypt(newTempPassword);

    const [result] = await db.query(
      "UPDATE students SET password = ?, encrypted_password = ?, is_first_login = TRUE WHERE id = ?",
      [hashedPassword, encryptedPassword, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.json({ 
      success: true, 
      message: "Password reset successfully",
      newTempPassword 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
