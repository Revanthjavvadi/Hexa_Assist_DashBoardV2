'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/adminController');

router.get   ('/settings',        ctrl.getSettings);
router.put   ('/settings',        ctrl.saveSettings);
router.get   ('/tags',            ctrl.getTagCatalog);
router.post  ('/tags',            ctrl.createTag);
router.put   ('/tags/:oldName',   ctrl.renameTag);
router.delete('/tags/:name',      ctrl.deleteTag);

module.exports = router;
