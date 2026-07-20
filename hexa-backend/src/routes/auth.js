'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/authController');

router.post  ('/login',        ctrl.login);
router.post  ('/logout',       ctrl.logout);
router.get   ('/users',        ctrl.listUsers);
router.post  ('/users',        ctrl.createUser);
router.put   ('/users/:id',    ctrl.updateUser);
router.delete('/users/:id',    ctrl.deleteUser);
router.post  ('/seed',         ctrl.seedUsers);   // seeds users.json → Cosmos on first run

module.exports = router;
