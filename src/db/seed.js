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
  ]) {
    await db.query(`TRUNCATE TABLE \`${table}\``);
  }
  await db.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("🗑️  Cleared all tables");

  /* ── 1. Admin ────────────────────────────────────────── */
  const hash = await bcrypt.hash("admin123", 10);
  const [adminResult] = await db.query(
    `INSERT INTO admins (name, email, password, institute, address)
     VALUES (?, ?, ?, ?, ?)`,
    [
      "Admin User",
      "admin@meritome.com",
      hash,
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
  const teacherIds = [];
  for (const t of teachers) {
    const [r] = await db.query(
      `INSERT INTO teachers (admin_id, name, email, phone, institute, location, subjects)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminId, t.name, t.email, t.phone, "Merit Home Pvt Ltd", t.location, JSON.stringify(t.subjects)]
    );
    teacherIds.push(r.insertId);
  }
  console.log(`👩‍🏫 ${teachers.length} teachers created`);

  /* ── 3. Students ─────────────────────────────────────── */
  const students = [
    { name:"Rahul Sharma",  email:"rahul@example.com",  phone:"9876543210", father_name:"Suresh Sharma",  father_phone:"9876543211", board:"CBSE",  standard:"10", course:"Science",  location:"Chinchwad", fee:5000, paid_fee:5000 },
    { name:"Priya Patel",   email:"priya@example.com",  phone:"9876543212", father_name:"Rajesh Patel",   father_phone:"9876543213", board:"ICSE",  standard:"9",  course:"Commerce", location:"Wakad",     fee:5000, paid_fee:2500 },
    { name:"Amit Kumar",    email:"amit@example.com",   phone:"9876543214", father_name:"Vikram Kumar",   father_phone:"9876543215", board:"State", standard:"11", course:"Science",  location:"Thergaon",  fee:6000, paid_fee:6000 },
    { name:"Sneha Joshi",   email:"sneha@example.com",  phone:"9876543216", father_name:"Prakash Joshi",  father_phone:"9876543217", board:"CBSE",  standard:"12", course:"Arts",     location:"Chinchwad", fee:7000, paid_fee:0    },
  ];
  const studentIds = [];
  for (const s of students) {
    const [r] = await db.query(
      `INSERT INTO students
         (admin_id,name,email,phone,father_name,father_phone,board,standard,course,location,institute,fee,paid_fee)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [adminId,s.name,s.email,s.phone,s.father_name,s.father_phone,s.board,s.standard,s.course,s.location,"Merit Home Pvt Ltd",s.fee,s.paid_fee]
    );
    studentIds.push(r.insertId);
  }
  console.log(`🎓 ${students.length} students created`);

  /* ── 4. Inquiries ────────────────────────────────────── */
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

  /* ── 5. Appointments ─────────────────────────────────── */
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

  /* ── 6. Invoices ─────────────────────────────────────── */
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

  /* ── 7. Finance records ──────────────────────────────── */
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
  console.log("────────────────────────────────────\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
