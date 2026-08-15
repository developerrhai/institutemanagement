const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth"); // Admin-only auth
const c = require("../controllers/inventoryController");

// Items
router.get("/items/summary", auth, c.getSummary);
router.get("/items", auth, c.getItems);
router.post("/items", auth, c.createItem);
router.put("/items/:id", auth, c.updateItem);
router.delete("/items/:id", auth, c.deleteItem);

// Distributions
router.get("/distributions", auth, c.getDistributions);
router.post("/distribute", auth, c.distribute);
router.delete("/distributions/:id", auth, c.undoDistribution);
router.get("/student/:studentId/items", auth, c.getStudentItems);

// Export
router.get("/export/items", auth, c.exportItems);
router.get("/export/distributions", auth, c.exportDistributions);

module.exports = router;
