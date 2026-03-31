const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const c = require("../controllers/financeController");
router.get("/summary", auth, c.summary);   // must be before /:id
router.get("/",        auth, c.getAll);
router.post("/",       auth, c.create);
router.delete("/:id",  auth, c.remove);
module.exports = router;
