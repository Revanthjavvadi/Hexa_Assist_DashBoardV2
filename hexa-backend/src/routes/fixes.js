'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/fixesController');

router.get('/', ctrl.getFixes);

module.exports = router;
