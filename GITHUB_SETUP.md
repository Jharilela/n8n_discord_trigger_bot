# GitHub Backup Setup Guide

This guide will help you set up automatic database backups to GitHub.

## Step 1: Create GitHub Personal Access Token

1. **Go to GitHub Settings**
   - Visit [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"

2. **Configure Token**
   - **Note**: `Discord Bot Database Backups`
   - **Expiration**: Choose an appropriate expiration (recommend 90 days)
   - **Scopes**: Select one of the following:
     - `repo` (for private repositories)
     - `public_repo` (for public repositories only)

3. **Generate and Copy Token**
   - Click "Generate token"
   - **IMPORTANT**: Copy the token immediately (you won't see it again!)

## Step 2: Add Environment Variables to Railway

1. **Go to Railway Dashboard**
   - Navigate to your bot service
   - Click "Variables" tab

2. **Add GitHub Variables**
   ```env
   GITHUB_USERNAME=your_github_username
   GITHUB_REPO=your_username/n8n_discord_bot
   GITHUB_TOKEN=your_personal_access_token_here
   ```

3. **Example Configuration**
   ```env
   GITHUB_USERNAME=johndoe
   GITHUB_REPO=johndoe/n8n_discord_bot
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

## Step 3: Verify Setup

1. **Check Railway Logs**
   - Go to your Railway service → Deployments → Latest → Logs
   - Look for backup messages like:
   ```
   Running scheduled backup...
   Creating backup: backups/backup-2024-01-15T10-00-00-000Z.sql
   Backup created successfully
   Git configuration completed
   Running Git command: git add .
   Git command completed: git add .
   Running Git command: git commit -m "Database backup: backup-2024-01-15T10-00-00-000Z.sql - 2024-01-15T10:00:00.000Z"
   Git command completed: git commit - m "Database backup: backup-2024-01-15T10-00-00-000Z.sql - 2024-01-15T10:00:00.000Z"
   Running Git command: git push origin main
   All Git commands completed successfully
   Scheduled backup completed successfully
   ```

2. **Check GitHub Repository**
   - Go to your GitHub repository
   - Look for the `backups/` directory
   - You should see SQL backup files with timestamps

## Step 4: Test Manual Backup

You can test the backup functionality manually:

1. **SSH into Railway** (if available) or trigger a manual backup
2. **Check the backup process** in logs
3. **Verify files appear** in your GitHub repository

## Troubleshooting

### **Issue: "Not in a Git repository"**
**Solution:**
- Ensure your Railway deployment is connected to a GitHub repository
- The bot needs to be deployed from a Git repository for backups to work

### **Issue: "Push failed"**
**Solution:**
- Check `GITHUB_TOKEN` has correct permissions
- Verify `GITHUB_REPO` format is correct (username/repository)
- Ensure repository exists and is accessible

### **Issue: "Authentication failed"**
**Solution:**
- Regenerate your GitHub Personal Access Token
- Check token hasn't expired
- Verify token has correct scopes

### **Issue: No backup files in GitHub**
**Solution:**
- Check Railway logs for backup errors
- Verify environment variables are set correctly
- Wait for the next hourly backup cycle

## Backup Schedule

- **Frequency**: Every hour (at minute 0)
- **Retention**: Last 24 backups kept
- **Location**: `backups/` directory in your GitHub repository
- **Format**: `backup-YYYY-MM-DDTHH-MM-SS-sssZ.sql`

## Security Notes

- **Never commit** your `GITHUB_TOKEN` to your repository
- **Use Railway environment variables** for secure storage
- **Rotate tokens regularly** (recommend every 90 days)
- **Use minimal permissions** (only `public_repo` if possible)

## Monitoring

### **Railway Logs**
Monitor backup success in Railway logs:
```
Railway Dashboard → Your Service → Deployments → Latest → Logs
```

### **GitHub Repository**
Check backup files in your repository:
```
https://github.com/your-username/n8n_discord_bot/tree/main/backups
```

### **Health Check**
The bot includes a health check endpoint:
```
https://your-app.railway.app
```

This will show bot status including backup information. 