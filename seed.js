/**
 * seed.js
 * Run: node seed.js
 * 
 * Note: While Mongoose/MongoDB was requested, this project actively uses MySQL.
 * Therefore, this script is implemented using mysql2/promise to seamlessly integrate
 * with the actual existing schema, using auto-incrementing integer Foreign Keys instead
 * of MongoDB ObjectIDs.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log("🌱 Starting Database Seed...");
  
  // 1. Connect to MySQL
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'institutems',
    multipleStatements: true,
  });

  try {
    // 2. Ensure missing tables and columns exist to prevent crashes
    console.log("🔧 Ensuring necessary tables & columns exist...");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS teacher_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        teacher_id INT UNSIGNED NOT NULL,
        batch VARCHAR(100) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS homework (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        subject VARCHAR(100),
        batch VARCHAR(100),
        teacher_id INT UNSIGNED NOT NULL,
        due_date DATE,
        attachment_url VARCHAR(255),
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS homework_status (
        homework_id INT NOT NULL,
        student_id INT UNSIGNED NOT NULL,
        status VARCHAR(50) NOT NULL,
        feedback TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (homework_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS teacher_updates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch VARCHAR(100),
        class_date DATE,
        class_time TIME,
        subject VARCHAR(100),
        chapter VARCHAR(100),
        topic VARCHAR(200)
      );
    `);
    
    // Attempt to add missing columns silently (if they don't already exist)
    try { await conn.query("ALTER TABLE admins ADD COLUMN role VARCHAR(50) DEFAULT 'admin'"); } catch (e) {}
    try { await conn.query("ALTER TABLE teachers ADD COLUMN password VARCHAR(255)"); } catch (e) {}
    try { await conn.query("ALTER TABLE teachers ADD COLUMN role VARCHAR(50) DEFAULT 'teacher'"); } catch (e) {}

    // 3. Clear existing data (Idempotent)
    console.log("🧹 Clearing old data to prevent duplicates...");
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query(`
      TRUNCATE TABLE homework_status;
      TRUNCATE TABLE homework;
      TRUNCATE TABLE teacher_updates;
      TRUNCATE TABLE teacher_batches;
      TRUNCATE TABLE invoices;
      TRUNCATE TABLE students;
      TRUNCATE TABLE teachers;
      TRUNCATE TABLE admins;
    `);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    const defaultPassword = await bcrypt.hash('Password123!', 10);
    
    // 4. Seed Super Admin
    console.log("👤 Seeding Super Admin...");
    const [adminResult] = await conn.query(
      `INSERT INTO admins (name, email, password, role, institute) VALUES (?, ?, ?, ?, ?)`,
      ['Super Admin', 'admin@merithome.com', defaultPassword, 'admin', 'Merit Home Institute']
    );
    const adminId = adminResult.insertId;

    // 5. Seed Teachers
    console.log("👨‍🏫 Seeding Teachers...");
    const teachersData = [
      ['Math Teacher', 'math@merithome.com', '["Math"]'],
      ['Science Teacher', 'science@merithome.com', '["Physics", "Chemistry"]'],
      ['English Teacher', 'english@merithome.com', '["English"]']
    ];
    
    const teacherIds = {};
    for (const [name, email, subjects] of teachersData) {
      const [res] = await conn.query(
        `INSERT INTO teachers (admin_id, name, email, password, role, subjects) VALUES (?, ?, ?, ?, ?, ?)`,
        [adminId, name, email, defaultPassword, 'teacher', subjects]
      );
      teacherIds[name.split(' ')[0]] = res.insertId; 
    }

    // 6. Seed Academic Structure (Batches mapping)
    console.log("📚 Seeding Academic Structure & Batches...");
    const batches = ['Class 9 Batch A', 'Class 10 Batch B'];
    
    // Assign teachers to batches
    await conn.query(`INSERT INTO teacher_batches (teacher_id, batch) VALUES (?, ?)`, [teacherIds['Math'], batches[0]]);
    await conn.query(`INSERT INTO teacher_batches (teacher_id, batch) VALUES (?, ?)`, [teacherIds['Math'], batches[1]]);
    await conn.query(`INSERT INTO teacher_batches (teacher_id, batch) VALUES (?, ?)`, [teacherIds['Science'], batches[0]]);
    await conn.query(`INSERT INTO teacher_batches (teacher_id, batch) VALUES (?, ?)`, [teacherIds['English'], batches[1]]);

    // 7. Seed Students & Parents
    console.log("🎓 Seeding Students...");
    const studentIds = [];
    for (let i = 1; i <= 10; i++) {
      const isBatchA = i <= 5;
      const [res] = await conn.query(
        `INSERT INTO students (admin_id, name, email, password, standard, course, father_name, father_phone, fee, paid_fee) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminId,
          `Student ${i}`,
          `student${i}@merithome.com`,
          defaultPassword,
          isBatchA ? 'Class 9' : 'Class 10',
          isBatchA ? 'Batch A' : 'Batch B',
          `Parent ${i}`,
          `987654321${i % 10}`,
          10000,
          0 // Adjusted in the fees step
        ]
      );
      studentIds.push({ id: res.insertId, batch: isBatchA ? batches[0] : batches[1], name: `Student ${i}` });
    }

    // 8. Seed Fees (Invoices)
    console.log("💰 Seeding Fees & Invoices...");
    const today = new Date();
    const pastDate = new Date(); pastDate.setDate(today.getDate() - 10);
    const futureDate = new Date(); futureDate.setDate(today.getDate() + 10);

    for (let i = 0; i < studentIds.length; i++) {
      const student = studentIds[i];
      let amount = 10000;
      let paid_amount = 0;
      let status = 'Pending';
      let due_date = futureDate.toISOString().split('T')[0];

      if (i < 3) {
        // Fully Paid
        paid_amount = 10000;
        status = 'Paid';
      } else if (i < 5) {
        // Partially Paid
        paid_amount = 5000;
        status = 'Partial';
      } else if (i === 5) {
        // Overdue
        due_date = pastDate.toISOString().split('T')[0];
        status = 'Pending';
      }

      await conn.query(
        `INSERT INTO invoices (admin_id, student_id, student_name, amount, paid_amount, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [adminId, student.id, student.name, amount, paid_amount, status, due_date]
      );
      // Update student table paid_fee
      await conn.query(`UPDATE students SET paid_fee = ? WHERE id = ?`, [paid_amount, student.id]);
    }

    // 9. Seed Homework & Teaching Logs
    console.log("📝 Seeding Homeworks & Teacher Updates...");
    // HW1: Overdue, Pending status
    const [hw1] = await conn.query(
      `INSERT INTO homework (title, description, subject, batch, teacher_id, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
      ['Algebra Basics', 'Complete page 10', 'Math', batches[0], teacherIds['Math'], pastDate.toISOString().split('T')[0]]
    );
    // HW2: No submissions (Future due date)
    await conn.query(
      `INSERT INTO homework (title, description, subject, batch, teacher_id, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
      ['Physics Gravity', 'Read chapter 4', 'Science', batches[0], teacherIds['Science'], futureDate.toISOString().split('T')[0]]
    );
    // HW3: Fully Completed
    const [hw3] = await conn.query(
      `INSERT INTO homework (title, description, subject, batch, teacher_id, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
      ['Shakespeare Essay', 'Write 500 words', 'English', batches[1], teacherIds['English'], pastDate.toISOString().split('T')[0]]
    );

    // Mark HW3 as Completed for all Batch B students
    const batchBStudents = studentIds.filter(s => s.batch === batches[1]);
    for (const student of batchBStudents) {
      await conn.query(
        `INSERT INTO homework_status (homework_id, student_id, status) VALUES (?, ?, ?)`,
        [hw3.insertId, student.id, 'Completed']
      );
    }
    
    // Mark HW1 as Pending for a Batch A student (Simulates an overdue homework)
    const batchAStudents = studentIds.filter(s => s.batch === batches[0]);
    await conn.query(
      `INSERT INTO homework_status (homework_id, student_id, status) VALUES (?, ?, ?)`,
      [hw1.insertId, batchAStudents[0].id, 'Pending']
    );

    // Teacher Logs
    await conn.query(
      `INSERT INTO teacher_updates (batch, class_date, class_time, subject, chapter, topic) VALUES (?, ?, ?, ?, ?, ?)`,
      [batches[0], pastDate.toISOString().split('T')[0], '10:00:00', 'Math', 'Algebra', 'Linear Equations']
    );
    await conn.query(
      `INSERT INTO teacher_updates (batch, class_date, class_time, subject, chapter, topic) VALUES (?, ?, ?, ?, ?, ?)`,
      [batches[0], today.toISOString().split('T')[0], '11:00:00', 'Science', 'Physics', 'Kinematics']
    );

    console.log("✅ Seed completed successfully! You can now login with the test credentials.");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    await conn.end();
  }
}

seed();
