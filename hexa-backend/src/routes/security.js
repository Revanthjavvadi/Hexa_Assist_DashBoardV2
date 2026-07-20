'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/securityController');

router.get('/', ctrl.getSecurity);

module.exports = router;
