const { sendToFacebookAPI } = require('../utils/facebookApi');

// Store recent events for status checking (in production, use a database)
const recentEvents = [];

/**
 * Send a single conversion event to Facebook
 */
const sendConversionEvent = async (req, res) => {
  try {
    const { event_name, event_data, user_data, custom_data } = req.body;
    
    // Prepare the event payload
    const eventPayload = {
      data: [{
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: req.headers.referer || 'https://miricledev.github.io/inner-performance-lp-1/',
        user_data: {
          ...user_data,
          client_ip_address: req.ip,
          client_user_agent: req.headers['user-agent']
        },
        custom_data: {
          ...custom_data,
          content_name: custom_data?.content_name || event_name,
          content_category: custom_data?.content_category || 'conversion'
        }
      }],
      access_token: process.env.FACEBOOK_ACCESS_TOKEN,
      test_event_code: process.env.NODE_ENV === 'development' ? 'TEST12345' : undefined
    };

    // Send to Facebook
    const response = await sendToFacebookAPI(eventPayload);
    
    // Store event for status tracking
    const eventRecord = {
      id: Date.now().toString(),
      event_name,
      timestamp: new Date().toISOString(),
      status: 'success',
      response: response.data
    };
    recentEvents.unshift(eventRecord);
    
    // Keep only last 100 events
    if (recentEvents.length > 100) {
      recentEvents.pop();
    }

    res.status(200).json({
      success: true,
      message: 'Conversion event sent successfully',
      event_id: eventRecord.id,
      facebook_response: response.data
    });

  } catch (error) {
    console.error('Error sending conversion event:', error);
    
    // Store failed event
    const failedEvent = {
      id: Date.now().toString(),
      event_name: req.body.event_name,
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: error.message
    };
    recentEvents.unshift(failedEvent);

    res.status(500).json({
      success: false,
      error: 'Failed to send conversion event',
      details: error.message
    });
  }
};

/**
 * Send multiple conversion events in batch
 */
const sendBatchEvents = async (req, res) => {
  try {
    const { events } = req.body;
    
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Events array is required and must not be empty'
      });
    }

    const batchPayload = {
      data: events.map(event => ({
        ...event,
        event_time: event.event_time || Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: req.headers.referer || 'https://yourdomain.com',
        user_data: {
          ...event.user_data,
          client_ip_address: req.ip,
          client_user_agent: req.headers['user-agent']
        }
      })),
      access_token: process.env.FACEBOOK_ACCESS_TOKEN,
      test_event_code: process.env.NODE_ENV === 'development' ? 'TEST12345' : undefined
    };

    const response = await sendToFacebookAPI(batchPayload);
    
    // Store batch events
    events.forEach(event => {
      const eventRecord = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        event_name: event.event_name,
        timestamp: new Date().toISOString(),
        status: 'success',
        batch: true
      };
      recentEvents.unshift(eventRecord);
    });

    res.status(200).json({
      success: true,
      message: `Successfully sent ${events.length} events`,
      facebook_response: response.data
    });

  } catch (error) {
    console.error('Error sending batch events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send batch events',
      details: error.message
    });
  }
};

/**
 * Get status of recent events
 */
const getEventStatus = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const limitedEvents = recentEvents.slice(0, parseInt(limit));
    
    const stats = {
      total: recentEvents.length,
      successful: recentEvents.filter(e => e.status === 'success').length,
      failed: recentEvents.filter(e => e.status === 'failed').length,
      recent_events: limitedEvents
    };

    res.status(200).json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error getting event status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get event status'
    });
  }
};

/**
 * Test endpoint for development
 */
const testEndpoint = async (req, res) => {
  try {
    // Send a test event
    const testEvent = {
      data: [{
        event_name: 'TestEvent',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://yourdomain.com/test',
        user_data: {
          client_ip_address: req.ip,
          client_user_agent: req.headers['user-agent']
        },
        custom_data: {
          content_name: 'Test Event',
          content_category: 'test'
        }
      }],
      access_token: process.env.FACEBOOK_ACCESS_TOKEN,
      test_event_code: 'TEST12345'
    };

    const response = await sendToFacebookAPI(testEvent);

    res.status(200).json({
      success: true,
      message: 'Test event sent successfully',
      facebook_response: response.data,
      environment: process.env.NODE_ENV,
      pixel_id: process.env.FACEBOOK_PIXEL_ID
    });

  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error.message
    });
  }
};

module.exports = {
  sendConversionEvent,
  sendBatchEvents,
  getEventStatus,
  testEndpoint
}; 