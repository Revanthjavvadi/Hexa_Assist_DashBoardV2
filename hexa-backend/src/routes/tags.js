'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/tagsController');

// GET  /api/tags              — fetch all tag assignments from Azure Cache
// PUT  /api/tags              — replace full tag list in Azure Cache
// POST /api/tags/assign       — add a single tag to a device
// POST /api/tags/remove       — remove a single tag from a device
router.get('/',         ctrl.getTags);
router.put('/',         ctrl.putTags);
router.post('/assign',  ctrl.assignTag);
router.post('/remove',  ctrl.removeTag);

module.exports = router;
