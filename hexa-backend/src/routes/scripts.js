'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/scriptsController');

router.get   ('/',    ctrl.listScripts);
router.get   ('/:id', ctrl.getScript);
router.put   ('/:id', ctrl.saveScript);
router.delete('/:id', ctrl.deleteScript);

module.exports = router;
