/**
 * seed.js
 * Run AFTER migrate:  node src/db/seed.js
 * Clears all tables and inserts realistic demo data.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const bcrypt = require("bcryptjs");
const db = require("../config/db");

/* ── helpers ────────────────────────────────────────────── */
const d = (offset = 0) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().split("T")[0];
};

/* ── main ───────────────────────────────────────────────── */
async function seed() {
  console.log("🌱 Starting seed…\n");

  // Disable FK checks so we can TRUNCATE in any order
  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "finance_records","invoices","appointments",
    "inquiries","teachers","students","admins",
    "branches","batches","boards","standards",
    "subjects","chapters","topics","notes","inquiry_extra"
  ]) {
    await db.query(`TRUNCATE TABLE \`${table}\``);
  }
  await db.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("🗑️  Cleared all tables");

  /* ── 1. Admin ────────────────────────────────────────── */
  const hash = await bcrypt.hash("admin123", 10);
  const [adminResult] = await db.query(
    `INSERT INTO admins (name, email, password, role, institute, address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "Admin User",
      "admin@meritome.com",
      hash,
      "admin",
      "Merit Home Private Limited",
      "123 Education Street, Pune, Maharashtra 411001",
    ]
  );
  const adminId = adminResult.insertId;
  console.log(`👤 Admin created  (id=${adminId})`);

  /* ── 2. Teachers ─────────────────────────────────────── */
  const teachers = [
    { name: "Dr. Anil Mehta",   email: "anil@meritome.com",   phone: "9876543220", location: "Chinchwad", subjects: ["Mathematics","Physics"] },
    { name: "Mrs. Sunita Rao",  email: "sunita@meritome.com",  phone: "9876543221", location: "Wakad",     subjects: ["Chemistry","Biology"] },
    { name: "Mr. Rajesh Kumar", email: "rajesh@meritome.com",  phone: "9876543222", location: "Thergaon",  subjects: ["English","History"] },
  ];
  const teacherHash = await bcrypt.hash("teacher123", 10);
  const teacherIds = [];
  for (const t of teachers) {
    const [r] = await db.query(
      `INSERT INTO teachers (admin_id, name, email, password, role, phone, institute, location, subjects)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, t.name, t.email, teacherHash, "teacher", t.phone, "Merit Home Pvt Ltd", t.location, JSON.stringify(t.subjects)]
    );
    teacherIds.push(r.insertId);
  }
  console.log(`👩‍🏫 ${teachers.length} teachers created`);

  /* ── 3. Branches ─────────────────────────────────────── */
  const [brResult1] = await db.query("INSERT INTO branches (branch_name) VALUES ('Chinchwad')");
  const [brResult2] = await db.query("INSERT INTO branches (branch_name) VALUES ('Wakad')");
  const [brResult3] = await db.query("INSERT INTO branches (branch_name) VALUES ('Thergaon')");
  const branchId1 = brResult1.insertId;
  const branchId2 = brResult2.insertId;
  const branchId3 = brResult3.insertId;
  console.log("🏢 Branches seeded");

  /* ── 4. Batches ──────────────────────────────────────── */
  const [baResult1] = await db.query(
    "INSERT INTO batches (branch_id, batch_name, start_time, end_time, batch_start_date, batch_end_date) VALUES (?, 'Morning Batch (7AM – 9AM)', '07:00:00', '09:00:00', '2026-01-01', '2026-12-31')",
    [branchId1]
  );
  const [baResult2] = await db.query(
    "INSERT INTO batches (branch_id, batch_name, start_time, end_time, batch_start_date, batch_end_date) VALUES (?, 'Evening Batch (5PM – 7PM)', '17:00:00', '19:00:00', '2026-01-01', '2026-12-31')",
    [branchId1]
  );
  const batchId1 = baResult1.insertId;
  const batchId2 = baResult2.insertId;
  console.log("📅 Batches seeded");

  /* ── 5. Boards ───────────────────────────────────────── */
  const [boResult1] = await db.query("INSERT INTO boards (name) VALUES ('CBSE')");
  const [boResult2] = await db.query("INSERT INTO boards (name) VALUES ('ICSE')");
  const boardId1 = boResult1.insertId;
  const boardId2 = boResult2.insertId;
  console.log("📋 Boards seeded");

  /* ── 6. Standards ────────────────────────────────────── */
  const [stResult1] = await db.query(
    "INSERT INTO standards (board_id, batch_id, name) VALUES (?, ?, '10th Standard')",
    [boardId1, batchId1]
  );
  const [stResult2] = await db.query(
    "INSERT INTO standards (board_id, batch_id, name) VALUES (?, ?, '12th Standard')",
    [boardId1, batchId1]
  );
  const standId1 = stResult1.insertId;
  const standId2 = stResult2.insertId;
  console.log("🏫 Standards seeded");

  /* ── 7. Subjects ─────────────────────────────────────── */
  const [subResult1] = await db.query(
    "INSERT INTO subjects (stand_id, name, teacher_id) VALUES (?, 'Physics', ?)",
    [standId1, teacherIds[1]] // Mrs. Sunita Rao
  );
  const [subResult2] = await db.query(
    "INSERT INTO subjects (stand_id, name, teacher_id) VALUES (?, 'Chemistry', ?)",
    [standId1, teacherIds[1]]
  );
  const subId1 = subResult1.insertId;
  const subId2 = subResult2.insertId;
  console.log("📚 Subjects seeded");

  /* ── 8. Chapters & Topics ────────────────────────────── */
  const [chapResult1] = await db.query(
    "INSERT INTO chapters (sub_id, name, description) VALUES (?, 'Laws of Motion', 'Newton\\'s laws and mechanics.')",
    [subId1]
  );
  const chapId1 = chapResult1.insertId;
  await db.query(
    "INSERT INTO topics (chap_id, topic_name, start_date, end_date) VALUES (?, 'First Law', '2026-06-01', '2026-06-05')",
    [chapId1]
  );
  console.log("📝 Chapters & Topics seeded");

  /* ── 9. Notes ────────────────────────────────────────── */
  await db.query(
    "INSERT INTO notes (chap_id, title, file_url) VALUES (?, 'Laws of Motion Revision PDF', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf')",
    [chapId1]
  );
  console.log("📑 Notes seeded");

  /* ── 10. Inquiry Extra ───────────────────────────────── */
  await db.query(
    `INSERT INTO inquiry_extra (name, phone, father_name, father_phone, dob, sex, email, address, standard, course, board, location, last_exam_marks, college_name, college_timing, future_plans, father_occupation, mother_occupation, sibling_name, reference, taking_coaching, hostel_required, inquiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "Arjun Singh", "9876540001", "Vikram Singh", "9876540002", "2010-05-15", "Male", "arjun@example.com", "Chinchwad, Pune", "10", "Science Tuition", "CBSE", "Chinchwad", "85%", "Vidya Niketan", "Morning", "Engineering", "Business", "Homemaker", "None", "Friend", "No", "No", new Date()
    ]
  );
  console.log("📋 Inquiry Extra seeded");

  /* ── 11. Students ────────────────────────────────────── */
  const students = [
    { name:"Rahul Sharma",  email:"rahul@example.com",  phone:"9876543210", father_name:"Suresh Sharma",  father_phone:"9876543211", board:"CBSE",  standard:"10", course:"Science",  location:"Chinchwad", fee:5000, paid_fee:5000 },
    { name:"Priya Patel",   email:"priya@example.com",  phone:"9876543212", father_name:"Rajesh Patel",   father_phone:"9876543213", board:"ICSE",  standard:"9",  course:"Commerce", location:"Wakad",     fee:5000, paid_fee:2500 },
    { name:"Amit Kumar",    email:"amit@example.com",   phone:"9876543214", father_name:"Vikram Kumar",   father_phone:"9876543215", board:"State", standard:"11", course:"Science",  location:"Thergaon",  fee:6000, paid_fee:6000 },
    { name:"Sneha Joshi",   email:"sneha@example.com",  phone:"9876543216", father_name:"Prakash Joshi",  father_phone:"9876543217", board:"CBSE",  standard:"12", course:"Arts",     location:"Chinchwad", fee:7000, paid_fee:0    },
  ];
  const studentHash = await bcrypt.hash("student123", 10);
  const studentIds = [];
  for (const s of students) {
    const [r] = await db.query(
      `INSERT INTO students
         (admin_id,name,email,password,phone,father_name,father_phone,board,standard,course,location,institute,fee,paid_fee,is_first_login)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [adminId,s.name,s.email,studentHash,s.phone,s.father_name,s.father_phone,s.board,s.standard,s.course,s.location,"Merit Home Pvt Ltd",s.fee,s.paid_fee]
    );
    studentIds.push(r.insertId);
  }
  console.log(`🎓 ${students.length} students created`);

  /* ── 12. Inquiries ───────────────────────────────────── */
  await db.query(
    `INSERT INTO inquiries (admin_id,name,phone,father_name,father_phone,course,location,board,standard,status,video,inquiry_date)
     VALUES
     (?,?,?,?,?,?,?,?,?,?,?,?),
     (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      adminId,"Arjun Singh",  "9876540001","Vikram Singh","9876540002","Science Tuition","Chinchwad","CBSE", "10","New",      "", d(0),
      adminId,"Neha Desai",   "9876540003","Mohan Desai", "9876540004","Math Classes",   "Wakad",    "ICSE", "9", "Contacted","", d(-1),
    ]
  );
  console.log("📋 Inquiries created");

  /* ── 13. Appointments ────────────────────────────────── */
  await db.query(
    `INSERT INTO appointments (admin_id,name,standard,board,course,appointment_date,appointment_time,location,whatsapp,status)
     VALUES
     (?,?,?,?,?,?,?,?,?,?),
     (?,?,?,?,?,?,?,?,?,?)`,
    [
      adminId,"Rahul Sharma","10","CBSE","Science Tuition", d(0), "10:00","Chinchwad","+919876543210","Pending",
      adminId,"Priya Patel", "9", "ICSE","Math Classes",    d(1), "14:00","Wakad",    "+919876543212","Confirmed",
    ]
  );
  console.log("📅 Appointments created");

  /* ── 14. Invoices ────────────────────────────────────── */
  await db.query(
    `INSERT INTO invoices (admin_id,student_id,student_name,amount,paid_amount,due_date,status,description)
     VALUES
     (?,?,?,?,?,?,?,?),
     (?,?,?,?,?,?,?,?),
     (?,?,?,?,?,?,?,?),
     (?,?,?,?,?,?,?,?)`,
    [
      adminId,studentIds[0],"Rahul Sharma",5000,5000,d(15),"Paid",   "Tuition Fee - Month 1",
      adminId,studentIds[1],"Priya Patel", 5000,2500,d(20),"Partial","Tuition Fee - Month 1",
      adminId,studentIds[2],"Amit Kumar",  6000,0,   d(10),"Pending","Tuition Fee - Month 1",
      adminId,studentIds[3],"Sneha Joshi", 7000,0,   d(-5),"Overdue","Tuition Fee - Month 1",
    ]
  );
  console.log("🧾 Invoices created");

  /* ── 15. Finance records ─────────────────────────────── */
  const payrollData = [
    { name:"Dr. Anil Mehta",   amount:25000 },
    { name:"Mrs. Sunita Rao",  amount:22000 },
    { name:"Mr. Rajesh Kumar", amount:20000 },
  ];
  const expenseData = [
    { name:"Office Rent",         category:"Rent",        amount:15000 },
    { name:"Electricity Bill",    category:"Electricity", amount:3500  },
    { name:"Marketing Campaign",  category:"Marketing",   amount:5000  },
    { name:"Stationery & Supplies",category:"Supplies",   amount:2000  },
  ];

  const financeRows = [];
  for (let monthOffset = 0; monthOffset <= 5; monthOffset++) {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - monthOffset);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-05`;

    for (const p of payrollData)
      financeRows.push([adminId,"Payroll", p.name, p.amount, dateStr, "Salary"]);
    for (const e of expenseData)
      financeRows.push([adminId,"Expense", e.name, e.amount, dateStr, e.category]);
  }

  await db.query(
    `INSERT INTO finance_records (admin_id,type,name,amount,record_date,category) VALUES ?`,
    [financeRows]
  );
  console.log(`💰 ${financeRows.length} finance records created`);

  /* ── Done ────────────────────────────────────────────── */
  console.log("\n✅ Seed complete!");
  console.log("────────────────────────────────────");
  console.log("🔐 Admin credentials");
  console.log("   Email    : admin@meritome.com");
  console.log("   Password : admin123");
  console.log("────────────────────────────────────");
  console.log("🔐 Student credentials");
  console.log("   Email    : rahul@example.com (or any student email)");
  console.log("   Password : student123");
  console.log("────────────────────────────────────\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
