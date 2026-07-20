'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/hipController');

router.get('/', ctrl.getHipChecks);

module.exports = router;
