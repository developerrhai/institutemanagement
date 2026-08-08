const db = require("../config/db");

/* ── POST /api/branches ─────────────────────────────────── */
// Create a new branch
exports.createBranch = async (req, res) => {
  try {
    const { branch_name } = req.body;

    // 1. Validate input
    if (!branch_name || branch_name.trim() === "") {
      return res.status(400).json({ 
        success: false, 
        message: "Branch name is required" 
      });
    }

    // 2. Check if branch already exists (Optional but recommended)
    const [existing] = await db.query(
      "SELECT branch_id FROM branches WHERE branch_name = ?", 
      [branch_name]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: "Branch already exists" 
      });
    }

    // 3. Insert into database
    const [result] = await db.query(
      "INSERT INTO branches (branch_name) VALUES (?)",
      [branch_name]
    );

    // 4. Send success response
    return res.status(201).json({
      success: true,
      message: "Branch created successfully",
      branch: {
        branch_id: result.insertId,
        branch_name: branch_name
      }
    });

  } catch (err) {
    console.error("Error creating branch:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error while creating branch" 
    });
  }
};

/* ── GET /api/branches ──────────────────────────────────── */
// Get all branches
exports.getBranches = async (req, res) => {
  try {
    // Fetch all branches, ordered alphabetically
    const [rows] = await db.query("SELECT * FROM branches ORDER BY branch_name ASC");

    return res.status(200).json({
      success: true,
      count: rows.length,
      branches: rows
    });

  } catch (err) {
    console.error("Error fetching branches:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error while fetching branches" 
    });
  }
};
