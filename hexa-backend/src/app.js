'use strict';
const path       = require('path');
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const config     = require('./config/env');
const logger     = require('./utils/logger');
const { apiLimiter }              = require('./middleware/rateLimiter');
const { notFound, errorHandler }  = require('./middleware/errorHandler');

// ── Routes ───────────────────────────────────────────────────
const healthRouter   = require('./routes/health');
const overviewRouter = require('./routes/overview');
const hipRouter      = require('./routes/hip');
const fixesRouter    = require('./routes/fixes');
const securityRouter = require('./routes/security');
const systemRouter   = require('./routes/system');
const scriptsRouter  = require('./routes/scripts');
const pinsRouter     = require('./routes/pins');
const pinAuditRouter = require('./routes/pinAudit');
const syncRouter     = require('./routes/syncStatus');
const tagsRouter     = require('./routes/tags');
const adminRouter    = require('./routes/admin');
const authRouter     = require('./routes/auth');
const tempAccessRouter = require('./routes/tempAccess');
const migrateRouter  = require('./routes/migrate');

const app = express();

// ── Security headers ─────────────────────────────────────────
app.use(helmet());

// ── CORS — allow configured origin(s). Same-origin (SPA served by this
//         Express app in production) does not need CORS, but keep it enabled
//         for local dev where the Vite server runs on a different port.
app.use(cors({
  origin:      config.frontendOrigin,
  methods:     ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Body parser ───────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── Request logger ────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.originalUrl}`);
  next();
});

// ── Rate limiter on all /api routes ──────────────────────────
app.use('/api', apiLimiter);

// ── Mount routes ─────────────────────────────────────────────
app.use('/health',              healthRouter);
app.use('/api/overview',        overviewRouter);
app.use('/api/hip',             hipRouter);
app.use('/api/fixes',           fixesRouter);
app.use('/api/security',        securityRouter);
app.use('/api/system',          systemRouter);
app.use('/api/scripts',         scriptsRouter);
app.use('/api/pins/audit',      pinAuditRouter);   // ← MUST be before /api/pins
app.use('/api/pins',            pinsRouter);
app.use('/api/sync-status',     syncRouter);
app.use('/api/cache',           syncRouter);
app.use('/api/tags',            tagsRouter);
app.use('/api/admin',           adminRouter);
app.use('/api/auth',            authRouter);
app.use('/api/temp-access',     tempAccessRouter);
app.use('/api/migrate',         migrateRouter);

// ── Serve the built frontend (Vite → dist copied to backend/public) ──────────
//    In production, the GitHub Actions workflow copies `hexa-assist/dist`
//    into `hexa-backend/public` so the same App Service serves both.
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// ── SPA fallback ─────────────────────────────────────────────
//    Any non-API GET that doesn't match a static file returns index.html so
//    React Router can handle client-side routes (e.g. /dashboard/overview).
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next();
  });
});

// ── 404 & error handling ─────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
