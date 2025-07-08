const Joi = require('joi');

// Validation schema for conversion events
const conversionEventSchema = Joi.object({
  event_name: Joi.string().required().min(1).max(100),
  event_data: Joi.object().optional(),
  user_data: Joi.object({
    em: Joi.string().email().optional(),
    ph: Joi.string().optional(),
    external_id: Joi.string().optional(),
    client_ip_address: Joi.string().ip().optional(),
    client_user_agent: Joi.string().optional(),
    fbc: Joi.string().optional(),
    fbp: Joi.string().optional(),
    subscription_id: Joi.string().optional(),
    fb_login_id: Joi.string().optional(),
    lead_id: Joi.string().optional(),
    dobd: Joi.string().optional(),
    dobm: Joi.string().optional(),
    doby: Joi.string().optional()
  }).optional(),
  custom_data: Joi.object({
    content_name: Joi.string().optional(),
    content_category: Joi.string().optional(),
    content_ids: Joi.array().items(Joi.string()).optional(),
    content_type: Joi.string().optional(),
    value: Joi.number().optional(),
    currency: Joi.string().length(3).optional(),
    delivery_category: Joi.string().optional(),
    num_items: Joi.number().integer().min(0).optional(),
    order_id: Joi.string().optional(),
    search_string: Joi.string().optional(),
    status: Joi.string().optional(),
    item_number: Joi.string().optional()
  }).optional()
});

// Validation schema for batch events
const batchEventsSchema = Joi.object({
  events: Joi.array().items(
    Joi.object({
      event_name: Joi.string().required(),
      event_time: Joi.number().optional(),
      user_data: Joi.object().optional(),
      custom_data: Joi.object().optional()
    })
  ).min(1).max(100).required()
});

/**
 * Validate conversion event request
 */
const validateConversionEvent = (req, res, next) => {
  const { error, value } = conversionEventSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails
    });
  }

  // Replace request body with validated data
  req.body = value;
  next();
};

/**
 * Validate batch events request
 */
const validateBatchEvents = (req, res, next) => {
  const { error, value } = batchEventsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails
    });
  }

  // Replace request body with validated data
  req.body = value;
  next();
};

/**
 * Validate query parameters
 */
const validateQueryParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: errorDetails
      });
    }

    // Replace query with validated data
    req.query = value;
    next();
  };
};

module.exports = {
  validateConversionEvent,
  validateBatchEvents,
  validateQueryParams
}; 