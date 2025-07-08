const axios = require('axios');

const FACEBOOK_API_URL = 'https://graph.facebook.com/v18.0/';
const PIXEL_ID = process.env.FACEBOOK_PIXEL_ID;

/**
 * Send events to Facebook Conversions API
 * @param {Object} eventPayload - The event payload to send
 * @returns {Promise<Object>} - Facebook API response
 */
const sendToFacebookAPI = async (eventPayload) => {
  try {
    if (!PIXEL_ID) {
      throw new Error('Facebook Pixel ID is not configured');
    }

    if (!process.env.FACEBOOK_ACCESS_TOKEN) {
      throw new Error('Facebook Access Token is not configured');
    }

    const url = `${FACEBOOK_API_URL}${PIXEL_ID}/events`;
    
    const response = await axios.post(url, eventPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Conversions-API-Server/1.0'
      },
      timeout: 10000 // 10 second timeout
    });

    // Log successful API calls in development
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Facebook API Response:', {
        status: response.status,
        events_received: response.data?.events_received,
        messages: response.data?.messages
      });
    }

    return response;

  } catch (error) {
    console.error('❌ Facebook API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method
      }
    });

    // Handle specific Facebook API errors
    if (error.response?.data?.error) {
      const fbError = error.response.data.error;
      throw new Error(`Facebook API Error: ${fbError.message} (Code: ${fbError.code})`);
    }

    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      throw new Error('Facebook API request timed out');
    }

    if (error.code === 'ENOTFOUND') {
      throw new Error('Unable to connect to Facebook API');
    }

    throw error;
  }
};

/**
 * Validate event payload before sending
 * @param {Object} eventPayload - The event payload to validate
 * @returns {Object} - Validation result
 */
const validateEventPayload = (eventPayload) => {
  const errors = [];

  // Check required fields
  if (!eventPayload.data || !Array.isArray(eventPayload.data)) {
    errors.push('data field is required and must be an array');
  }

  if (!eventPayload.access_token) {
    errors.push('access_token is required');
  }

  // Validate each event in the data array
  if (eventPayload.data) {
    eventPayload.data.forEach((event, index) => {
      if (!event.event_name) {
        errors.push(`Event ${index}: event_name is required`);
      }

      if (!event.event_time) {
        errors.push(`Event ${index}: event_time is required`);
      }

      if (!event.action_source) {
        errors.push(`Event ${index}: action_source is required`);
      }

      // Validate user_data if present
      if (event.user_data) {
        if (event.user_data.em && !isValidEmail(event.user_data.em)) {
          errors.push(`Event ${index}: Invalid email format in user_data.em`);
        }

        if (event.user_data.ph && !isValidPhone(event.user_data.ph)) {
          errors.push(`Event ${index}: Invalid phone format in user_data.ph`);
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Hash email for privacy (SHA256)
 * @param {string} email - Email to hash
 * @returns {string} - Hashed email
 */
const hashEmail = async (email) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
};

/**
 * Hash phone number for privacy (SHA256)
 * @param {string} phone - Phone number to hash
 * @returns {string} - Hashed phone number
 */
const hashPhone = async (phone) => {
  const crypto = require('crypto');
  // Remove all non-digit characters before hashing
  const cleanPhone = phone.replace(/\D/g, '');
  return crypto.createHash('sha256').update(cleanPhone).digest('hex');
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - Is valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - Is valid phone
 */
const isValidPhone = (phone) => {
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');
  // Check if it's between 7 and 15 digits
  return cleanPhone.length >= 7 && cleanPhone.length <= 15;
};

/**
 * Prepare user data with proper hashing
 * @param {Object} userData - Raw user data
 * @returns {Promise<Object>} - Prepared user data with hashed values
 */
const prepareUserData = async (userData) => {
  const prepared = { ...userData };

  // Hash email if present
  if (prepared.em) {
    prepared.em = await hashEmail(prepared.em);
  }

  // Hash phone if present
  if (prepared.ph) {
    prepared.ph = await hashPhone(prepared.ph);
  }

  return prepared;
};

module.exports = {
  sendToFacebookAPI,
  validateEventPayload,
  hashEmail,
  hashPhone,
  isValidEmail,
  isValidPhone,
  prepareUserData
}; 