# Inner Performance Landing Page

## Calendar Integration Setup

### Prerequisites
1. Google Cloud Platform account
2. Google Calendar API enabled
3. API credentials generated

### Setup Steps
1. Copy `config.template.json` to `config.json`
2. Fill in your Google Calendar credentials:
   ```json
   {
       "apiKey": "your-api-key-here",
       "calendarId": "your-calendar-id-here"
   }
   ```
3. Never commit `config.json` to git
4. For production, set up environment variables on your hosting platform

### Google Calendar API Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable Google Calendar API
4. Create credentials (API key)
5. Set up OAuth consent screen
6. Configure authorized domains

### Security Notes
- Keep your API credentials secure
- Use appropriate API key restrictions
- Set up proper CORS configuration
- Monitor API usage 