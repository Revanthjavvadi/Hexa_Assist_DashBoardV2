'use strict';
require('dotenv').config();

const config = {
  port:              parseInt(process.env.PORT ?? '4000', 10),
  frontendOrigin:    process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  logLevel:          process.env.LOG_LEVEL ?? 'info',

  cacheTtlSeconds:   Math.min(parseInt(process.env.CACHE_TTL_SECONDS ?? '300', 10), 900),
  refreshIntervalMs: Math.min(parseInt(process.env.REFRESH_INTERVAL_MS ?? '300000', 10), 900_000),

  syncIntervalMinutes: Math.min(
    Math.max(parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '15', 10), 5), 60),

  pinSyncIntervalMinutes: Math.min(
    Math.max(parseInt(process.env.PIN_SYNC_INTERVAL_MINUTES ?? '5', 10), 1), 60),

  pinAuditSyncIntervalMinutes: Math.min(
    Math.max(parseInt(process.env.PIN_AUDIT_SYNC_INTERVAL_MINUTES ?? '15', 10), 5), 60),

  azure: {
    blobSasUrl:     process.env.AZURE_BLOB_SAS_URL ?? '',
    storageAccount: process.env.AZURE_STORAGE_ACCOUNT ?? '',
    containerName:  process.env.AZURE_CONTAINER_NAME ?? 'selfx-123456789',
  },

  azurePins: {
    blobSasUrl:    process.env.AZURE_PINS_BLOB_SAS_URL ?? '',
    containerName: process.env.AZURE_PINS_CONTAINER_NAME ?? 'macos-252304',
  },

  // ── Azure Cosmos DB — 4-container architecture ────────────────────────────
  //
  //  dashboard  — Overview, System Info, HIP, Security, Fixes, Scripts
  //               Each doc has a 'type' field identifying the data type.
  //               type values: 'overview' | 'system' | 'hip' | 'security' | 'fix' | 'script'
  //
  //  admin      — Users, Roles, Settings, Device Tags, Tag Catalog, Temp Access
  //               Each doc has a 'type' field:
  //               'user' | 'admin-settings' | 'tag-assignment' | 'tag-catalog' | 'temp-access'
  //
  //  pins       — PIN Management records
  //               One doc per device: { id, hostname, rawPin, ... }
  //
  //  audit      — PIN Audit Logs
  //               One doc per attempt: { id, hostname, outcome, timestamp, ... }
  //
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT ?? '',
    key:      process.env.COSMOS_KEY      ?? '',
    database: process.env.COSMOS_DATABASE ?? 'hexa-assist',
    containers: {
      dashboard: process.env.COSMOS_CONTAINER_DASHBOARD ?? 'dashboard',
      admin:     process.env.COSMOS_CONTAINER_ADMIN     ?? 'admin',
      pins:      process.env.COSMOS_CONTAINER_PINS      ?? 'pins',
      audit:     process.env.COSMOS_CONTAINER_AUDIT     ?? 'audit',
    },
  },
};

if (!config.azure.blobSasUrl) {
  console.warn('[CONFIG] AZURE_BLOB_SAS_URL is not set — Blob source unavailable.');
}
if (!config.cosmos.endpoint || !config.cosmos.key) {
  console.warn('[CONFIG] COSMOS_ENDPOINT / COSMOS_KEY not set — Cosmos DB unavailable. Add them to .env.');
}

module.exports = config;
