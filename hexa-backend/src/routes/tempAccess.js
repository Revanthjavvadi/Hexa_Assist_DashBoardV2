'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/tempAccessController');

router.get   ('/',              ctrl.listGrants);
router.post  ('/',              ctrl.createGrant);
router.delete('/:id',           ctrl.revokeGrant);
router.get   ('/user/:userId',  ctrl.getUserGrants);

module.exports = router;
