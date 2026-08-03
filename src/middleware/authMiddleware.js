const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const { id, role } = decoded;
      const upperRole = role ? role.toUpperCase() : '';
      req.user = { id, role: upperRole };
      
      let table = 'admins';
      if (upperRole === 'STUDENT') table = 'students';
      if (upperRole === 'TEACHER') table = 'teachers';
      
      const [rows] = await pool.query(`SELECT * FROM ?? WHERE id = ?`, [table, id]);
      
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      // Check soft delete if student
      if (role === 'STUDENT' && rows[0].deleted_at !== null) {
        return res.status(401).json({ message: 'Not authorized, user disabled or not found' });
      }

      req.user = { ...rows[0], role: upperRole };
      
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role ${req.user.role} is not authorized to access this route` });
    }
    next();
  };
};

module.exports = { protect, authorize };
