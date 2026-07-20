'use strict';
const rateLimit = require('express-rate-limit');

// 200 requests per minute per IP — adjust as needed
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, error: 'Too many requests, please try again later.' },
});

module.exports = { apiLimiter };
