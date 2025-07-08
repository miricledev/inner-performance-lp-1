# Facebook Conversions API Backend Server

A Node.js/Express server for handling Facebook Conversions API events. This server provides a secure, scalable way to send conversion events to Facebook's Conversions API with proper validation, error handling, and monitoring.

## Features

- ✅ **Facebook Conversions API Integration** - Send events directly to Facebook
- ✅ **Request Validation** - Joi-based validation for all incoming requests
- ✅ **Rate Limiting** - Protect against abuse with configurable rate limits
- ✅ **Security** - Helmet.js for security headers, CORS protection
- ✅ **Error Handling** - Comprehensive error handling and logging
- ✅ **Event Tracking** - Track and monitor event delivery status
- ✅ **Batch Processing** - Support for sending multiple events at once
- ✅ **Development Tools** - Test endpoints and health checks

## Quick Start

### 1. Installation

```bash
# Clone or create the backend directory
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### 2. Environment Configuration

Create a `.env` file with your Facebook credentials:

```env
# Facebook Conversions API
FACEBOOK_ACCESS_TOKEN=EAAXkVuekdRsBO78hmoxhneoZBme14FC0FOWKgY902kooCThoNkZAQtfuDI7jPTytkGFhXlXDVpUru3W4V3qqextOyGdPAQsXk0SQprZA2lhr1q5waETC1HXL6WQ7ZC5uexjNni8IlIyqZCrjMSZCcojPsVJDUU4YmimGuryXVwhydehD0ZBZALFUFKIyhFblPQkTvAZDZD
FACEBOOK_PIXEL_ID=1304427447032116

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,https://yourdomain.com
```

### 3. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and environment information.

### Send Single Event
```
POST /api/conversions/event
```

**Request Body:**
```json
{
  "event_name": "Lead",
  "user_data": {
    "em": "user@example.com",
    "ph": "07123456789",
    "client_ip_address": "192.168.1.1",
    "client_user_agent": "Mozilla/5.0..."
  },
  "custom_data": {
    "content_name": "Contact Form",
    "content_category": "form_submission",
    "value": 30,
    "currency": "GBP"
  }
}
```

### Send Batch Events
```
POST /api/conversions/batch
```

**Request Body:**
```json
{
  "events": [
    {
      "event_name": "Lead",
      "user_data": {
        "em": "user@example.com"
      },
      "custom_data": {
        "content_name": "Contact Form"
      }
    },
    {
      "event_name": "PageView",
      "user_data": {
        "client_ip_address": "192.168.1.1"
      }
    }
  ]
}
```

### Check Event Status
```
GET /api/conversions/status?limit=20
```

Returns statistics and recent events.

### Test Endpoint
```
POST /api/conversions/test
```

Sends a test event to Facebook (development only).

## Frontend Integration

### JavaScript Example

```javascript
// Send a conversion event
const sendConversionEvent = async (eventData) => {
  try {
    const response = await fetch('http://localhost:3000/api/conversions/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_name: 'Lead',
        user_data: {
          em: 'user@example.com',
          ph: '07123456789',
          client_ip_address: '192.168.1.1',
          client_user_agent: navigator.userAgent
        },
        custom_data: {
          content_name: 'Contact Form',
          content_category: 'form_submission',
          value: 30,
          currency: 'GBP'
        }
      })
    });

    const result = await response.json();
    console.log('Event sent:', result);
  } catch (error) {
    console.error('Error sending event:', error);
  }
};

// Usage
sendConversionEvent();
```

### Update Your Frontend

Replace your current Facebook Pixel calls with server-side calls:

```javascript
// Instead of this:
fbq('track', 'Lead', { content_name: 'Contact Form' });

// Use this:
fetch('/api/conversions/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event_name: 'Lead',
    custom_data: { content_name: 'Contact Form' }
  })
});
```

## Event Types

Common Facebook conversion events you can send:

- `Lead` - When someone submits a form
- `Contact` - When someone contacts you
- `PageView` - When someone views a page
- `ViewContent` - When someone views content
- `AddToCart` - When someone adds to cart
- `Purchase` - When someone makes a purchase
- `CompleteRegistration` - When someone completes registration

## Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configurable allowed origins
- **Input Validation**: All requests validated with Joi
- **Security Headers**: Helmet.js for security headers
- **Error Handling**: No sensitive data exposed in errors

## Monitoring

### Event Status
Check `/api/conversions/status` to monitor:
- Total events sent
- Successful vs failed events
- Recent event history

### Logs
The server logs all API calls and errors. In development, you'll see:
- Successful Facebook API responses
- Failed requests with detailed error information
- Request/response details

## Production Deployment

### Environment Variables
Set these in production:
```env
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
```

### Process Manager
Use PM2 for production:
```bash
npm install -g pm2
pm2 start server.js --name "conversions-api"
pm2 startup
pm2 save
```

### Reverse Proxy
Use Nginx as a reverse proxy:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Check your `CORS_ORIGIN` setting
2. **Facebook API Errors**: Verify your access token and pixel ID
3. **Rate Limiting**: Check if you're hitting rate limits
4. **Validation Errors**: Ensure all required fields are present

### Debug Mode
Set `NODE_ENV=development` for detailed logging and test event codes.

## Support

For issues or questions:
1. Check the logs for error details
2. Verify your Facebook credentials
3. Test with the `/api/conversions/test` endpoint
4. Check the health endpoint: `/health`

## License

ISC License 