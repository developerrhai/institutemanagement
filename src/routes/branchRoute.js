const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");

// Route to get all branches
router.get("/", branchController.getBranches);

// Route to create a new branch
router.post("/", branchController.createBranch);

module.exports = router;
