# Inner Performance Landing Page

## Calendar Integration Setup

### Prerequisites
1. SimplyBook.me account
2. API access enabled
3. API credentials generated

### Setup Steps
1. Copy `config.template.json` to `config.json`
2. Fill in your SimplyBook.me credentials:
   ```json
   {
       "companyLogin": "your-company-login",
       "apiToken": "your-api-token",
       "unitId": "your-unit-id"
   }
   ```
3. Never commit `config.json` to git
4. For production, set up environment variables on your hosting platform

### SimplyBook.me API Setup
1. Go to [SimplyBook.me](https://www.simplybook.me)
2. Create an account or log in to your existing account
3. Go to Settings > API & Integrations
4. Enable API access
5. Generate API token
6. Note down your company login and unit ID

### Security Notes
- Keep your API credentials secure
- Use appropriate API key restrictions
- Set up proper CORS configuration
- Monitor API usage 