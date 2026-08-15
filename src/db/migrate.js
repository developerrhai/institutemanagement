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
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100)  NOT NULL,
  email             VARCHAR(150)  NOT NULL UNIQUE,
  password          VARCHAR(255)  NOT NULL,
  role              VARCHAR(50)   NOT NULL DEFAULT 'admin',
  institute         VARCHAR(200)  NOT NULL DEFAULT '',
  address           TEXT,
  reset_otp         VARCHAR(6)    DEFAULT NULL,
  reset_otp_expires DATETIME      DEFAULT NULL,
  last_otp_sent     DATETIME      DEFAULT NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  password     VARCHAR(255) DEFAULT NULL,
  deleted_at   DATETIME     DEFAULT NULL,
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
  password   VARCHAR(255) DEFAULT NULL,
  role       VARCHAR(50)  DEFAULT 'teacher',
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
-- 7b. branches & batches
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  branch_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_name VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS batches (
  batch_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  batch_name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  batch_start_date DATE NOT NULL,
  batch_end_date DATE NOT NULL,
  late_grace_minutes INT DEFAULT 10,
  scheduled_days VARCHAR(100) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 8. boards
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boards (
  board_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ─────────────────────────────────────────────────────────
-- 9. standards
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS standards (
  stand_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  board_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(board_id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ─────────────────────────────────────────────────────────
-- 10. subjects
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  sub_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stand_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  teacher_id INT UNSIGNED DEFAULT NULL,
  FOREIGN KEY (stand_id) REFERENCES standards(stand_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ─────────────────────────────────────────────────────────
-- 11. chapters
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapters (
  chap_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sub_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  FOREIGN KEY (sub_id) REFERENCES subjects(sub_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ─────────────────────────────────────────────────────────
-- 12. topics
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
  topic_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chap_id INT UNSIGNED NOT NULL,
  topic_name VARCHAR(200) NOT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  FOREIGN KEY (chap_id) REFERENCES chapters(chap_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ─────────────────────────────────────────────────────────
-- 13. notes
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  note_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chap_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chap_id) REFERENCES chapters(chap_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ─────────────────────────────────────────────────────────
-- 14. inquiry_extra
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiry_extra (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  father_name VARCHAR(100) DEFAULT '',
  father_phone VARCHAR(20) DEFAULT '',
  course VARCHAR(100) DEFAULT '',
  location VARCHAR(100) DEFAULT '',
  board VARCHAR(20) DEFAULT '',
  standard VARCHAR(10) DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'New',
  video VARCHAR(500) DEFAULT '',
  dob DATE DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  college_name VARCHAR(200) DEFAULT '',
  college_timing VARCHAR(100) DEFAULT '',
  last_exam_marks VARCHAR(50) DEFAULT '',
  father_occupation VARCHAR(100) DEFAULT '',
  mother_occupation VARCHAR(100) DEFAULT '',
  future_plans VARCHAR(200) DEFAULT '',
  reference VARCHAR(100) DEFAULT '',
  sibling_name VARCHAR(100) DEFAULT '',
  sex VARCHAR(20) DEFAULT '',
  taking_coaching VARCHAR(20) DEFAULT '',
  hostel_required VARCHAR(20) DEFAULT '',
  admin_id INT UNSIGNED DEFAULT NULL,
  inquiry_date DATE DEFAULT NULL
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

-- ─────────────────────────────────────────────────────────
-- 15. teacher_batches
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_batches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT UNSIGNED NOT NULL,
  batch VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_batch (teacher_id, batch),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────
-- 16. homework
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(100) NOT NULL,
  batch VARCHAR(100) NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  attachment_url VARCHAR(500) DEFAULT NULL,
  branch VARCHAR(100) DEFAULT NULL,
  board VARCHAR(100) DEFAULT NULL,
  standard VARCHAR(100) DEFAULT NULL,
  chapter VARCHAR(100) DEFAULT NULL,
  topic VARCHAR(200) DEFAULT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────
-- 17. homework_status
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework_status (
  homework_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  feedback TEXT DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (homework_id, student_id),
  FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────
-- 18. teaching_logs
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teaching_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_date DATE NOT NULL,
  subject VARCHAR(100) NOT NULL,
  topic VARCHAR(200) NOT NULL,
  notes TEXT DEFAULT NULL,
  batch VARCHAR(100) NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_batch_date (teacher_id, batch, class_date),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function ensureOtpColumns(conn) {
  // Create branches table if missing
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS branches (
        branch_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        branch_name VARCHAR(100) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    console.log("✅ branches table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create branches table:", err.message);
  }

  // Create batches table if missing
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        branch_id INT UNSIGNED NOT NULL,
        batch_name VARCHAR(100) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        batch_start_date DATE NOT NULL,
        batch_end_date DATE NOT NULL,
        late_grace_minutes INT DEFAULT 10,
        scheduled_days VARCHAR(100) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("✅ batches table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create batches table:", err.message);
  }

  try {
    await conn.query(`
      ALTER TABLE admins 
      ADD COLUMN role VARCHAR(50) DEFAULT 'admin',
      ADD COLUMN reset_otp VARCHAR(6) DEFAULT NULL,
      ADD COLUMN reset_otp_expires DATETIME DEFAULT NULL,
      ADD COLUMN last_otp_sent DATETIME DEFAULT NULL
    `);
    console.log("✅ Ensured OTP & rate limiting columns exist in admins table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ OTP & rate limiting columns already exist in admins table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on admins:", err.message);
    }
  }

  try {
    await conn.query(`
      ALTER TABLE teachers 
      ADD COLUMN password VARCHAR(255) DEFAULT NULL,
      ADD COLUMN role VARCHAR(50) DEFAULT 'teacher',
      ADD COLUMN reset_otp VARCHAR(6) DEFAULT NULL,
      ADD COLUMN reset_otp_expires DATETIME DEFAULT NULL,
      ADD COLUMN last_otp_sent DATETIME DEFAULT NULL
    `);
    console.log("✅ Ensured OTP & rate limiting columns exist in teachers table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ OTP & rate limiting columns already exist in teachers table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on teachers:", err.message);
    }
  }

  // Phase 1 Additions for Students
  try {
    await conn.query(`
      ALTER TABLE students 
      ADD COLUMN password VARCHAR(255) DEFAULT NULL,
      ADD COLUMN deleted_at DATETIME DEFAULT NULL
    `);
    console.log("✅ Ensured password & deleted_at columns exist in students table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ password & deleted_at columns already exist in students table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on students:", err.message);
    }
  }

  // Phase 2 Additions for Students
  try {
    await conn.query(`
      ALTER TABLE students 
      ADD COLUMN encrypted_password VARCHAR(255) DEFAULT NULL,
      ADD COLUMN is_first_login BOOLEAN DEFAULT TRUE
    `);
    console.log("✅ Ensured encrypted_password & is_first_login columns exist in students table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ encrypted_password or is_first_login already exists in students table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on students for new auth columns:", err.message);
    }
  }

  // Phase 3 Attendance Additions
  try {
    await conn.query(`
      ALTER TABLE students 
      ADD COLUMN biometric_code VARCHAR(50) UNIQUE DEFAULT NULL
    `);
    console.log("✅ Ensured biometric_code column exists in students table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ biometric_code already exists in students table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on students for biometric_code:", err.message);
    }
  }

  try {
    await conn.query(`
      ALTER TABLE teachers 
      ADD COLUMN biometric_code VARCHAR(50) UNIQUE DEFAULT NULL
    `);
    console.log("✅ Ensured biometric_code column exists in teachers table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ biometric_code already exists in teachers table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on teachers for biometric_code:", err.message);
    }
  }

  // Ensure batches table has late_grace_minutes and scheduled_days columns
  try {
    await conn.query(`
      ALTER TABLE batches 
      ADD COLUMN late_grace_minutes INT DEFAULT 10,
      ADD COLUMN scheduled_days VARCHAR(100) DEFAULT 'Mon,Tue,Wed,Thu,Fri'
    `);
    console.log("✅ Ensured late_grace_minutes & scheduled_days exist in batches table");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column name")) {
      console.log("✅ late_grace_minutes or scheduled_days already exists in batches table");
    } else {
      console.warn("⚠️ Could not run ALTER TABLE on batches:", err.message);
    }
  }

  // Create student_batches table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS student_batches (
        student_id INT UNSIGNED NOT NULL,
        batch_id INT UNSIGNED NOT NULL,
        PRIMARY KEY (student_id, batch_id),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("✅ student_batches table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create student_batches table:", err.message);
  }

  // Create teacher_batch_mappings table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS teacher_batch_mappings (
        teacher_id INT UNSIGNED NOT NULL,
        batch_id INT UNSIGNED NOT NULL,
        PRIMARY KEY (teacher_id, batch_id),
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("✅ teacher_batch_mappings table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create teacher_batch_mappings table:", err.message);
  }

  // Create attendance table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        role ENUM('STUDENT', 'TEACHER') NOT NULL,
        date DATE NOT NULL,
        punch_in_time TIME DEFAULT NULL,
        punch_out_time TIME DEFAULT NULL,
        status ENUM('Present', 'Absent', 'Late', 'Half-Day', 'On Leave') NOT NULL DEFAULT 'Absent',
        source ENUM('Manual', 'Smart Office') NOT NULL DEFAULT 'Manual',
        smart_office_reference_id VARCHAR(100) DEFAULT NULL,
        batch_id INT UNSIGNED DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_date_role_batch (user_id, date, role, batch_id),
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log("✅ attendance table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create attendance table:", err.message);
  }

  // ── Chat System Tables ────────────────────────────────
  // chat_groups
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(150)  NOT NULL,
        description   TEXT          DEFAULT NULL,
        created_by    INT UNSIGNED  NOT NULL       COMMENT 'admin id who created the group',
        is_deleted    TINYINT(1)    NOT NULL DEFAULT 0,
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_by (created_by),
        INDEX idx_is_deleted (is_deleted)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ chat_groups table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create chat_groups table:", err.message);
  }

  // chat_group_members
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_group_members (
        id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
        group_id      INT UNSIGNED  NOT NULL       COMMENT 'FK → chat_groups.id',
        user_id       INT UNSIGNED  NOT NULL       COMMENT 'user id from admins/teachers/students',
        user_role     ENUM('ADMIN','TEACHER','STUDENT') NOT NULL,
        joined_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        removed_at    TIMESTAMP     NULL     DEFAULT NULL,
        UNIQUE KEY uq_group_user (group_id, user_id, user_role),
        INDEX idx_user_id (user_id),
        INDEX idx_group_active (group_id, removed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ chat_group_members table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create chat_group_members table:", err.message);
  }

  // chat_messages
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        group_id      INT UNSIGNED    NOT NULL       COMMENT 'FK → chat_groups.id',
        sender_id     INT UNSIGNED    NOT NULL,
        sender_role   ENUM('ADMIN','TEACHER','STUDENT') NOT NULL,
        sender_name   VARCHAR(150)    NOT NULL       COMMENT 'Denormalized for fast reads',
        message_text  TEXT            NOT NULL,
        is_deleted    TINYINT(1)      NOT NULL DEFAULT 0,
        created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_group_time (group_id, created_at DESC),
        INDEX idx_sender (sender_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ chat_messages table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create chat_messages table:", err.message);
  }

  // fcm_tokens table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        public_id   VARCHAR(50)   NOT NULL UNIQUE,
        user_id     INT UNSIGNED   NOT NULL,
        user_role   ENUM('ADMIN','STUDENT','TEACHER') NOT NULL DEFAULT 'STUDENT',
        token       VARCHAR(500)  NOT NULL UNIQUE,
        device_type VARCHAR(50)   DEFAULT 'web',
        last_active TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        KEY idx_fcm_tokens_user (user_id, user_role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ fcm_tokens table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create fcm_tokens table:", err.message);
  }

  // notifications table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        public_id       VARCHAR(50)   NOT NULL UNIQUE,
        title           VARCHAR(255)  NOT NULL,
        body            TEXT          NOT NULL,
        target_type     ENUM('single', 'bulk', 'filtered') NOT NULL,
        target_role     ENUM('ALL', 'STUDENT', 'TEACHER', 'ADMIN') NOT NULL DEFAULT 'STUDENT',
        target_criteria JSON          DEFAULT NULL,
        sent_by         INT UNSIGNED  DEFAULT NULL,
        sent_by_role    VARCHAR(20)   DEFAULT 'ADMIN',
        success_count   INT           DEFAULT 0,
        failure_count   INT           DEFAULT 0,
        status          ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        KEY idx_notifications_public (public_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ notifications table verified/created.");
  } catch (err) {
    console.warn("⚠️ Could not create notifications table:", err.message);
  }
}

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

  // Run ALTER TABLE to add missing columns in existing databases
  await ensureOtpColumns(conn);

  await conn.end();
  console.log("\n🎉 Migration complete!\n");
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  });
}

module.exports = {
  ensureOtpColumns,
};
