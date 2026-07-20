'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/systemController');

router.get('/', ctrl.getSystemInfo);

module.exports = router;
