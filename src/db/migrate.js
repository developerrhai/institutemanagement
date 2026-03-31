/**
 * migrate.js
 * Run once:  node src/db/migrate.js
 * Creates the database (if missing) and all tables.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mysql = require("mysql2/promise");

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "institutems",
} = process.env;

const DDL = `
-- ─────────────────────────────────────────────────────────
-- 1. admins  (login accounts for institute owners / staff)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,
  institute   VARCHAR(200)  NOT NULL DEFAULT '',
  address     TEXT,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 2. students
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id     INT UNSIGNED NOT NULL,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) DEFAULT NULL,
  phone        VARCHAR(20)  DEFAULT '',
  father_name  VARCHAR(100) DEFAULT '',
  father_phone VARCHAR(20)  DEFAULT '',
  board        ENUM('CBSE','ICSE','State','') DEFAULT '',
  standard     VARCHAR(10)  DEFAULT '',
  course       VARCHAR(100) DEFAULT '',
  location     VARCHAR(100) DEFAULT '',
  institute    VARCHAR(200) DEFAULT '',
  fee          DECIMAL(10,2) DEFAULT 0.00,
  paid_fee     DECIMAL(10,2) DEFAULT 0.00,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 3. teachers
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id   INT UNSIGNED NOT NULL,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(150) DEFAULT NULL,
  phone      VARCHAR(20)  DEFAULT '',
  institute  VARCHAR(200) DEFAULT '',
  location   VARCHAR(100) DEFAULT '',
  subjects   JSON         DEFAULT NULL,   -- e.g. ["Math","Physics"]
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 4. inquiries
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiries (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id     INT UNSIGNED NOT NULL,
  name         VARCHAR(100) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  father_name  VARCHAR(100) DEFAULT '',
  father_phone VARCHAR(20)  DEFAULT '',
  course       VARCHAR(100) DEFAULT '',
  location     VARCHAR(100) DEFAULT '',
  board        VARCHAR(20)  DEFAULT '',
  standard     VARCHAR(10)  DEFAULT '',
  status       ENUM('New','Contacted','Follow Up','Admission Done','Not Interested') NOT NULL DEFAULT 'New',
  video        VARCHAR(500) DEFAULT '',
  inquiry_date DATE         NOT NULL DEFAULT (CURRENT_DATE),
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 5. appointments
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id         INT UNSIGNED NOT NULL,
  name             VARCHAR(100) NOT NULL,
  standard         VARCHAR(10)  DEFAULT '',
  board            VARCHAR(20)  DEFAULT '',
  course           VARCHAR(100) DEFAULT '',
  appointment_date DATE         NOT NULL,
  appointment_time TIME         NOT NULL,
  location         VARCHAR(100) DEFAULT '',
  whatsapp         VARCHAR(25)  DEFAULT '',
  status           ENUM('Pending','Confirmed','Done','Cancelled') NOT NULL DEFAULT 'Pending',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 6. invoices
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id     INT UNSIGNED NOT NULL,
  student_id   INT UNSIGNED DEFAULT NULL,
  student_name VARCHAR(100) NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  paid_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  due_date     DATE          DEFAULT NULL,
  status       ENUM('Paid','Partial','Pending','Overdue') NOT NULL DEFAULT 'Pending',
  description  VARCHAR(500)  DEFAULT '',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id)   REFERENCES admins(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 7. finance_records  (payroll + expenses)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_records (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id     INT UNSIGNED NOT NULL,
  type         ENUM('Payroll','Expense') NOT NULL,
  name         VARCHAR(200) NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  record_date  DATE          NOT NULL,
  category     VARCHAR(100)  DEFAULT '',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function migrate() {
  // Connect WITHOUT specifying a database so we can CREATE it
  const conn = await mysql.createConnection({
    host: DB_HOST, port: parseInt(DB_PORT),
    user: DB_USER, password: DB_PASSWORD,
    multipleStatements: true,
  });

  console.log("📦 Connected to MySQL as root");

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`✅ Database '${DB_NAME}' ready`);

  await conn.query(`USE \`${DB_NAME}\``);

  // Run all CREATE TABLE statements
  await conn.query(DDL);
  console.log("✅ All tables created (or already existed)");

  await conn.end();
  console.log("\n🎉 Migration complete!\n");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
