'use strict';
/**
 * PIN Routes — /api/pins
 * Only handles PIN list and reveal. No /:param conflicts with /audit.
 * Data read exclusively from Cosmos DB.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/pinsController');

// GET /api/pins — list all PINs (masked)
router.get('/', ctrl.getPins);

// GET /api/pins/:id/reveal — return decoded PIN from Cosmos DB
router.get('/:id/reveal', ctrl.revealPin);

module.exports = router;
