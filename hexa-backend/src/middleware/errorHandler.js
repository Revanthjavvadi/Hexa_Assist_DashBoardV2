'use strict';
const logger = require('../utils/logger');

// 404 – no route matched
function notFound(req, res) {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Global error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  logger.error('[ErrorHandler]', {
    message: err.message,
    stack:   err.stack,
    path:    req.originalUrl,
  });
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    success: false,
    error:   process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}

module.exports = { notFound, errorHandler };
