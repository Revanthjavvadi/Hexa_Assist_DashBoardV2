'use strict';
const router = require('express').Router();
const config = require('../config/env');

router.get('/', (_req, res) => {
  const cosmos = require('../services/cosmosService');
  res.json({
    status:       'ok',
    timestamp:    new Date().toISOString(),
    blobReady:    !!config.azure.blobSasUrl,
    cosmosReady:  cosmos.isAvailable(),
    version:      process.env.npm_package_version ?? '1.0.0',
  });
});

module.exports = router;
