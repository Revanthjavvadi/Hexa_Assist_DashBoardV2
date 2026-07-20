'use strict';
/**
 * Fallback data — returned when Blob Storage is not yet connected.
 * Replace these with real Blob reads once SAS URL is configured.
 * Shape must exactly match what the frontend expects.
 */

module.exports = {
  overview: {
    totalDevices:        0,
    totalFixesToday:     0,
    securityCompliance:  0,
    devicesAtRisk:       0,
    lastCheckIn:         'Not connected — add SAS URL to .env',
    fixStatusPie:        [],
    dailyFixTrend:       [],
    deviceHealthDist:    [],
    complianceTrend:     [],
  },

  hipChecks: [],

  fixes: [],

  security: [],

  systemInfo: [],

  scripts: [],
};
