'use strict';
const app     = require('./app');
const config  = require('./config/env');
const logger  = require('./utils/logger');
const syncJob = require('./services/syncJob');
const cosmos  = require('./services/cosmosService');

const server = app.listen(config.port, () => {
  logger.info(`HEXA ASSIST Backend  →  http://localhost:${config.port}`);
  logger.info(`Frontend origin:     ${config.frontendOrigin}`);
  logger.info(`─────────────────────────────────────────────`);
  logger.info(`Blob source:         ${config.azure.blobSasUrl ? config.azure.containerName + '  ✓ CONNECTED' : '✗ NOT CONFIGURED'}`);
  logger.info(`PIN blob source:     ${config.azurePins.blobSasUrl ? config.azurePins.containerName + '  ✓ CONNECTED' : '✗ NOT CONFIGURED'}`);
  logger.info(`Cosmos DB:           ${cosmos.isAvailable() ? config.cosmos.database + '  ✓ CONFIGURED' : '✗ NOT CONFIGURED  (add COSMOS_ENDPOINT + COSMOS_KEY to .env)'}`);
  logger.info(`─────────────────────────────────────────────`);
  logger.info(`Dashboard sync:      every ${config.syncIntervalMinutes} min  → 'dashboard' container (overview/fix/hip/security/system/script)`);
  logger.info(`PIN sync:            every ${config.pinSyncIntervalMinutes} min  → 'pins' container (JWT decoded backend-only)`);
  logger.info(`PIN Audit sync:      every ${config.pinAuditSyncIntervalMinutes} min  → 'audit' container`);
  logger.info(`Admin/Users sync:    on startup                 → 'admin' container (users/settings/tags/temp-access)`);
  logger.info(`In-memory cache TTL: ${config.cacheTtlSeconds}s`);
  logger.info(`─────────────────────────────────────────────`);

  // Start background sync: Blob Storage → Cosmos DB (one-way, every SYNC_INTERVAL_MINUTES)
  syncJob.start();

  // Auto-seed users from users.json into Cosmos 'admin' container (type='user') on first startup
  if (cosmos.isAvailable()) {
    cosmos.queryAdminByType('user').then(existing => {
      if (existing.length === 0) {
        const usersJson = require('./users.json');
        Promise.all(usersJson.map(u => cosmos.upsertOne('admin', {
          id:          u.id,
          type:        'user',
          username:    u.username,
          email:       u.email || '',
          displayName: u.displayName,
          role:        u.role,
          createdAt:   new Date().toISOString(),
        }))).then(() => logger.info(`[Server] Auto-seeded ${usersJson.length} users into admin container`))
           .catch(e => logger.error('[Server] User seed error', { error: e.message }));
      } else {
        logger.info(`[Server] Users already seeded (${existing.length} users in admin container)`);
      }
    }).catch(e => logger.warn('[Server] Could not check admin container for users', { error: e.message }));
  }
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM — shutting down gracefully');
  syncJob.stop();
  server.close(() => { logger.info('Server closed'); process.exit(0); });
});
process.on('SIGINT', () => {
  logger.info('SIGINT — shutting down gracefully');
  syncJob.stop();
  server.close(() => { logger.info('Server closed'); process.exit(0); });
});
