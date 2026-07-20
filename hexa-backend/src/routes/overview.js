'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/overviewController');

router.get('/', ctrl.getOverview);

module.exports = router;
