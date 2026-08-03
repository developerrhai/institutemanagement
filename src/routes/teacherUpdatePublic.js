		/**
		 *  * teacherUpdatePublic.js
		  * Public endpoint – teachers submit their class update without logging in.
		   *
		    * Add to server.js:
		     *   app.use("/api/teacher-updates/public", require("./routes/teacherUpdatePublic"));
		      */

		const express = require("express")
		const router  = express.Router()
		const db      = require("../config/db")

		/* ─────────────── POST: Submit Teacher Update ─────────────── */
		router.post("/", async (req, res) => {
		try {
		const {
		teacher_name, batch, subject, chapter,
		topic, branch, class_date, class_time, remarks,
		} = req.body

		// Validation
		if (!teacher_name || !batch || !subject || !chapter || !topic || !branch || !class_date || !class_time) {
		return res.status(400).json({ success: false, message: "All fields are required" })
		}

		// Attach to first admin (single-institute)
		const [admins] = await db.query("SELECT id FROM admins LIMIT 1")
		if (!admins.length)
		return res.status(500).json({ success: false, message: "No admin configured" })

		const adminId = admins[0].id

		// Insert into teacher_updates
		const [result] = await db.query(
		`INSERT INTO teacher_updates
		(admin_id, teacher_name, batch, subject, chapter, topic, branch, class_date, class_time, remarks)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[adminId, teacher_name, batch, subject, chapter, topic, branch, class_date, class_time, remarks || null]
		                            )

		// Optional: Auto-create students for all students in this batch
		const [students] = await db.query(
		"SELECT id, name FROM students WHERE admin_id = ? AND location = ?",
		[adminId, branch]
		)

		if (students.length > 0) {
		const rows = students.map(s => [
		adminId, s.id, s.name, batch, subject, chapter,
		topic, branch, class_date, class_time, teacher_name, "Completed",
		])

		await db.query(
		`INSERT INTO students
		(admin_id, student_id, student_name, batch, subject, chapter,
		topic, branch, update_date, class_time, teacher_name, status)
		VALUES ?`,
		[rows]
		)
		}

		return res.status(201).json({
		success: true,
		message: "Class update submitted successfully",
		id: result.insertId,
		students: students.length,
		})
		} catch (err) {
		console.error("Teacher update error:", err)
		return res.status(500).json({ success: false, message: "Server error" })
		}
		})

		/* ─────────────── GET: Public Fetch All Updates ───────────────
		* Anyone can fetch all updates without login
		* Optional filters: teacher, branch, date
		*/
		router.get("/", async (req, res) => {
		try {
		const { teacher, branch, date } = req.query
		let sql = "SELECT id, teacher_name, batch, subject, chapter, topic, branch, class_date, class_time, remarks FROM teacher_updates WHERE 1=1"
		const params = []

		if (teacher) { sql += " AND teacher_name = ?"; params.push(teacher) }
		if (branch)  { sql += " AND branch = ?";       params.push(branch) }
		if (date)    { sql += " AND class_date = ?";   params.push(date) }

		sql += " ORDER BY class_date DESC, class_time DESC"
		const [rows] = await db.query(sql, params)
		res.json({ success: true, updates: rows })
		} catch (err) {
		console.error("Public fetch error:", err)
		res.status(500).json({ success: false, message: "Server error" })
		}
		})

		/* ─────────────── GET: Verify Teacher Update ───────────────
		* Optional, for quick verification
		*/
		router.get("/verify", async (req, res) => {
		try {
		const { teacher, branch, date } = req.query
		let sql = "SELECT id, teacher_name, batch, subject, chapter, topic, branch, class_date, class_time FROM teacher_updates WHERE 1=1"
		const params = []

		if (teacher) { sql += " AND teacher_name = ?"; params.push(teacher) }
		if (branch)  { sql += " AND branch = ?";       params.push(branch) }
		if (date)    { sql += " AND class_date = ?";   params.push(date) }

		sql += " ORDER BY class_date DESC, class_time DESC LIMIT 20"
		const [rows] = await db.query(sql, params)
		res.json({ success: true, data: rows })
		} catch (err) {
		res.status(500).json({ success: false, message: "Server error" })
		}
		})

		module.exports = router

