const express = require('express');
const router = express.Router();
const conversionsController = require('../controllers/conversionsController');
const { validateConversionEvent, validateBatchEvents } = require('../middleware/validation');

// POST /api/conversions/event
// Send a conversion event to Facebook
router.post('/event', validateConversionEvent, conversionsController.sendConversionEvent);

// POST /api/conversions/batch
// Send multiple conversion events in batch
router.post('/batch', validateBatchEvents, conversionsController.sendBatchEvents);

// GET /api/conversions/status
// Check the status of recent events
router.get('/status', conversionsController.getEventStatus);

// POST /api/conversions/test
// Test endpoint for development
router.post('/test', conversionsController.testEndpoint);

module.exports = router; 