const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

const loginStudent = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE email = ? OR phone = ?', [email, email]);
    
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const student = rows[0];

    // Check if soft deleted
    if (student.deleted_at !== null) {
      return res.status(401).json({ message: 'Student account is disabled or deleted' });
    }
    
    let passwordMatch = false;
    let shouldUpdatePassword = false;
    let plainTextPasswordToSave = '';

    if (student.password) {
      passwordMatch = await bcrypt.compare(password, student.password);
    } else {
      // Fallback to default password: Student@<last 4 digits of phone>
      const phone = student.phone || '';
      const phoneLast4 = phone.length >= 4 ? phone.slice(-4) : '0000';
      const defaultPassword = `Student@${phoneLast4}`;
      if (password === defaultPassword) {
        passwordMatch = true;
        shouldUpdatePassword = true;
        plainTextPasswordToSave = defaultPassword;
      }
    }

    if (passwordMatch) {
      if (shouldUpdatePassword) {
        const { encrypt } = require('../utils/crypto');
        const hashedPassword = await bcrypt.hash(plainTextPasswordToSave, 12);
        const encryptedPassword = encrypt(plainTextPasswordToSave);
        await pool.query(
          'UPDATE students SET password = ?, encrypted_password = ?, is_first_login = TRUE WHERE id = ?',
          [hashedPassword, encryptedPassword, student.id]
        );
      }

      res.json({
        id: student.id,
        name: student.name,
        email: student.email,
        role: 'STUDENT',
        token: generateToken(student.id, 'STUDENT'),
        is_first_login: !!student.is_first_login
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const studentId = req.user.id;

  try {
    const [rows] = await pool.query('SELECT phone, password FROM students WHERE id = ?', [studentId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = rows[0];

    // Verify current password
    let passwordMatch = false;
    if (student.password) {
      passwordMatch = await bcrypt.compare(currentPassword, student.password);
    } else {
      const phone = student.phone || '';
      const phoneLast4 = phone.length >= 4 ? phone.slice(-4) : '0000';
      const defaultPassword = `Student@${phoneLast4}`;
      passwordMatch = (currentPassword === defaultPassword);
    }

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid current password' });
    }

    const { encrypt } = require('../utils/crypto');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const encryptedPassword = encrypt(newPassword);

    await pool.query(
      'UPDATE students SET password = ?, encrypted_password = ?, is_first_login = FALSE WHERE id = ?',
      [hashedPassword, encryptedPassword, studentId]
    );

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { loginStudent, changePassword };
