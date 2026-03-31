const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const c = require("../controllers/invoicesController");
router.get("/summary", auth, c.summary);   // must be before /:id
router.get("/",        auth, c.getAll);
router.get("/:id",     auth, c.getOne);
router.post("/",       auth, c.create);
router.put("/:id",     auth, c.update);
router.delete("/:id",  auth, c.remove);
module.exports = router;
