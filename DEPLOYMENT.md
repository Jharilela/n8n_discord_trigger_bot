# Deployment Guide

This guide will help you deploy the n8n Discord Bot to Railway with PostgreSQL database.

## Prerequisites

1. **Discord Bot Setup**
   - Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a bot for your application
   - Copy the bot token and client ID
   - Add the bot to your server with required permissions

2. **GitHub Repository**
   - Fork or clone this repository to your GitHub account
   - Ensure the repository is public or you have Railway Pro

## Railway Deployment Steps

### Step 1: Create Railway Account
1. Go to [Railway](https://railway.app)
2. Sign up with your GitHub account
3. Get $5 in free credits using referral code: `jay`

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your forked repository
4. Railway will automatically detect it's a Node.js project

### Step 3: Add PostgreSQL Database
1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for the database to be created
4. Copy the `DATABASE_URL` from the database service

### Step 4: Configure Environment Variables
1. Go to your main service (the bot)
2. Click on "Variables" tab
3. Add the following environment variables:

```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_client_id_here
DATABASE_URL=postgresql://... (from PostgreSQL service)
NODE_ENV=production

# Optional: GitHub backup configuration
GITHUB_USERNAME=your_github_username
GITHUB_REPO=your_username/n8n_discord_bot
GITHUB_TOKEN=your_github_personal_access_token
```

### Step 5: Configure GitHub Backups (Optional)
1. Create a GitHub Personal Access Token:
   - Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (for private repos) or `public_repo` (for public repos)
   - Copy the token

2. Add GitHub environment variables to Railway:
   - `GITHUB_USERNAME`: Your GitHub username
   - `GITHUB_REPO`: Your repository (e.g., `username/n8n_discord_bot`)
   - `GITHUB_TOKEN`: Your personal access token

### Step 6: Deploy
1. Railway will automatically deploy your bot
2. Check the "Deployments" tab for build status
3. Monitor logs to ensure successful startup

## Verification

### Check Bot Status
1. Go to your Discord server
2. Verify the bot is online
3. Try using `/stats` command (requires Administrator permission)

### Test Webhook Setup
1. In any channel, use `/setup https://your-n8n-webhook-url`
2. Send a test message
3. Check your n8n workflow to see if the webhook was received

### Health Check
1. Go to your Railway service
2. Click on the generated domain (e.g., `https://your-app.railway.app`)
3. You should see a JSON response with bot status

## Troubleshooting

### Common Issues

**Bot not connecting to Discord**
- Check `DISCORD_TOKEN` is correct
- Verify bot is added to server with proper permissions
- Check Railway logs for connection errors

**Slash commands not working**
- Ensure `DISCORD_CLIENT_ID` is correct
- Check bot has "Use Slash Commands" permission
- Wait a few minutes for commands to register

**Database connection errors**
- Verify `DATABASE_URL` format
- Check PostgreSQL service is running
- Ensure SSL settings are correct for production

**Webhook not receiving data**
- Validate webhook URL format (must start with https://)
- Check n8n webhook is active and accessible
- Review bot logs for webhook delivery errors

### Logs and Monitoring

**Railway Logs**
- Go to your service → "Deployments" → Click on latest deployment
- Check "Logs" tab for real-time logs
- Look for any error messages or warnings

**Health Check Endpoint**
- Visit `https://your-app.railway.app`
- Should return JSON with bot status
- Useful for monitoring bot connectivity

## Scaling and Maintenance

### Automatic Scaling
- Railway automatically scales based on demand
- No manual configuration required
- Monitor usage in Railway dashboard

### Database Backups
- Bot automatically creates hourly backups
- Backups are pushed to GitHub in `backups/` directory
- Keeps last 24 backups (configurable)

### Updates
- Push changes to your GitHub repository
- Railway automatically redeploys
- Monitor deployment logs for any issues

## Cost Optimization

### Railway Credits
- Get $5 free credits with referral code: `jay`
- Monitor usage in Railway dashboard
- Consider upgrading to Pro for private repos

### Resource Usage
- Bot is lightweight and efficient
- PostgreSQL database is shared (minimal cost)
- Automatic scaling prevents over-provisioning

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files to Git
   - Use Railway's secure environment variable storage
   - Rotate tokens regularly

2. **Database Security**
   - Railway handles PostgreSQL security
   - Database is isolated and encrypted
   - Regular backups ensure data safety

3. **Bot Permissions**
   - Only grant necessary Discord permissions
   - Use role-based access for slash commands
   - Monitor bot activity regularly

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Railway logs for error messages
3. Verify all environment variables are set correctly
4. Test locally before deploying
5. Open an issue on GitHub if problems persist

---

**Need help?** Join our Discord server or open an issue on GitHub! 