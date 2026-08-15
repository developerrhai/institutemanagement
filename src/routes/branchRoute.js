const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");

// Route to get all branches
router.get("/", branchController.getBranches);

// Route to create a new branch
router.post("/", branchController.createBranch);

// Route to update a branch
router.put("/:id", branchController.updateBranch);

// Route to delete a branch
router.delete("/:id", branchController.deleteBranch);

module.exports = router;
