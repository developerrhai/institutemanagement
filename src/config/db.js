const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "3306"),
  user:     process.env.DB_USER     || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME     || "institutems",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",   // store all datetimes as UTC
});

// quick connectivity check used on startup
pool.testConnection = async () => {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
};

module.exports = pool;
