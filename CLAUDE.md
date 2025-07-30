# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start the bot in development mode
npm run dev

# Start the bot in production mode  
npm start

# Run manual backup
npm run backup
node backup.js

# Data utilities for backup management
node data-utils.js list                      # List all available backups
node data-utils.js backup                    # Create manual backup
node data-utils.js restore <backup-name>     # Restore from specific backup
node data-utils.js latest                    # Show latest backup details

# Testing
node test-github-auth.js                     # Test GitHub authentication
node test-backup.js                          # Test backup system
```

## Architecture Overview

This is a Discord bot that forwards Discord events (messages, reactions, threads) to webhook URLs on a per-channel basis. The bot supports n8n, Zapier, Make.com, and custom webhooks.

### Core Components

- **index.js** - Main bot entry point with Discord event handlers and slash commands
- **database.js** - PostgreSQL database operations for storing channel-webhook mappings  
- **backup.js** - CSV-based backup system with GitHub integration
- **data-utils.js** - CLI utilities for backup management

### Database Schema

- **channel_webhooks** - Maps Discord channel IDs to webhook URLs (channel_id, webhook_url, guild_id)
- **guilds** - Stores Discord server information (id, name)

### Event Flow

1. Discord events trigger handlers in index.js
2. Bot checks if channel has configured webhook via database.js
3. If webhook exists, event data is formatted and sent via axios POST
4. Events use consistent JSON structure with author, channel, guild, timestamp

### Backup System

- Hourly automatic CSV backups via cron job (index.js:713)
- Manual backup/restore operations via data-utils.js
- GitHub integration for version-controlled backup storage
- Metadata tracking in backup directories

### Required Environment Variables

```
DISCORD_TOKEN=<bot_token>
DISCORD_CLIENT_ID=<application_id>  
DATABASE_URL=<postgresql_connection_string>
GITHUB_USERNAME=<github_username>
GITHUB_REPO=<username/repo>
GITHUB_TOKEN=<github_personal_access_token>
```

### Slash Commands

- `/setup <webhook_url>` - Configure webhook for current channel (tests webhook first)
- `/remove` - Remove webhook from current channel
- `/status` - Show webhook status for current channel
- `/list` - List all webhooks in server
- `/stats` - Show bot statistics (admin only)
- `/privacy` - Display the bot's privacy policy

### Webhook Health Management

The bot automatically tracks webhook failures and disables problematic webhooks:
- **Failure tracking**: Records consecutive webhook failures in database
- **Auto-disable**: Webhooks disabled after 5 consecutive failures  
- **Manual recovery**: Admins can re-setup webhooks using `/setup` command
- **Error types**: 404, 403, 410 errors disable immediately; timeouts/DNS errors are retried
- **Production logging**: Minimal logging in production to prevent traffic snooping

### Event Types Supported

- message_create / thread_message
- reaction_add / reaction_remove (with thread variants)
- thread_create / thread_delete / thread_update  
- thread_member_join / thread_member_leave