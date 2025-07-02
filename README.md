# n8n Discord Bot

A powerful Discord bot that routes messages, reactions, and thread events to n8n webhooks on a per-channel basis. This bot allows you to configure different n8n webhook URLs for different Discord channels, enabling flexible automation workflows.

## Features

- **Per-Channel Webhook Configuration**: Set up different n8n webhook URLs for each Discord channel
- **Slash Commands**: Easy-to-use Discord slash commands for configuration
- **Comprehensive Event Tracking**: Captures messages, reactions, thread events, and more
- **PostgreSQL Database**: Persistent storage for webhook configurations
- **Automatic Backups**: Hourly database backups to GitHub
- **Railway Deployment Ready**: Optimized for Railway hosting

## Supported Events

- **Messages**: All text messages in configured channels
- **Reactions**: Emoji reactions added/removed from messages
- **Thread Events**: Thread creation, deletion, updates, and member joins/leaves
- **Rich Data**: Includes user info, channel info, guild info, and timestamps

## Setup Instructions

### 1. Prerequisites

- Node.js 16+ 
- PostgreSQL database (Railway recommended)
- Discord Bot Token
- Discord Application Client ID
- GitHub Personal Access Token (for automatic backups)

### 2. Environment Variables

Create a `.env` file with the following variables:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id

# Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database

# Optional: Set to 'production' for Railway
NODE_ENV=production
```

### 3. Installation

```bash
# Install dependencies
npm install

# Start the bot
npm start
```

### 4. Discord Bot Setup

1. Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot for your application
3. Copy the bot token and client ID
4. Add the bot to your server with the following permissions:
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - Manage Channels (for webhook setup)

### 5. GitHub Personal Access Token (Optional)

For automatic database backups to GitHub:

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name like "Discord Bot Backups"
4. Select scopes: `repo` (for private repos) or `public_repo` (for public repos)
5. Copy the generated token
6. Add it to your environment variables as `GITHUB_TOKEN`

## Usage

### Slash Commands

#### `/setup <webhook_url>`
Configure an n8n webhook URL for the current channel.

**Permissions**: Manage Channels

**Example**:
```
/setup https://n8n.emp0.com/webhook/discord-channel-A
```

#### `/remove`
Remove the n8n webhook configuration from the current channel.

**Permissions**: Manage Channels

#### `/status`
Check the webhook configuration status for the current channel.

**Permissions**: Manage Channels

#### `/list`
List all configured webhooks in the current server.

**Permissions**: Manage Channels

#### `/stats`
Show bot statistics (total webhooks, servers, etc.).

**Permissions**: Administrator

### Webhook Payload Format

The bot sends structured JSON payloads to your n8n webhooks:

```json
{
  "event_type": "message_create",
  "timestamp": 1640995200000,
  "content": {
    "text": "Hello, world!",
    "type": "message_create"
  },
  "author": {
    "id": "123456789012345678",
    "username": "username",
    "discriminator": "0000"
  },
  "channel": {
    "id": "123456789012345678",
    "name": "general",
    "type": 0
  },
  "guild": {
    "id": "123456789012345678",
    "name": "My Server"
  },
  "message_id": "123456789012345678",
  "timestamp": 1640995200000
}
```

## Railway Deployment

### 1. Database Setup

1. Create a new PostgreSQL service in Railway
2. Copy the `DATABASE_URL` from Railway
3. Add it to your environment variables

### 2. Bot Deployment

1. Connect your GitHub repository to Railway
2. Set the following environment variables in Railway:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `DATABASE_URL`
   - `NODE_ENV=production`

### 3. Automatic Backups

The bot automatically creates hourly database backups and pushes them to GitHub. Backups are stored in the `backups/` directory and kept for 24 hours.

**GitHub Backup Configuration (Optional):**
```env
GITHUB_USERNAME=your_github_username
GITHUB_REPO=your_username/n8n_discord_bot
GITHUB_TOKEN=your_github_personal_access_token
```

**Note:** If GitHub credentials are not provided, backups will still be created locally but won't be pushed to GitHub.

## Database Schema

### channel_webhooks
Stores the mapping between Discord channels and n8n webhook URLs.

```sql
CREATE TABLE channel_webhooks (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(20) UNIQUE NOT NULL,
    webhook_url TEXT NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### guilds
Stores Discord server information.

```sql
CREATE TABLE guilds (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Event Types

The bot sends different event types to help you identify the source:

- `message_create` - New message in a channel
- `thread_message` - New message in a thread
- `reaction_add` - Emoji reaction added
- `thread_reaction_add` - Emoji reaction added in thread
- `reaction_remove` - Emoji reaction removed
- `thread_reaction_remove` - Emoji reaction removed in thread
- `thread_create` - New thread created
- `thread_delete` - Thread deleted
- `thread_update` - Thread properties updated
- `thread_member_join` - User joined thread
- `thread_member_leave` - User left thread

## Development

### Project Structure

```
n8n_discord_bot/
├── index.js          # Main bot file
├── database.js       # Database operations
├── backup.js         # Database backup utilities
├── package.json      # Dependencies and scripts
├── README.md         # This file
└── backups/          # Database backup files (auto-generated)
```

### Available Scripts

```bash
npm start          # Start the bot
npm run backup     # Run manual database backup
```

### Adding New Event Types

To add support for new Discord events:

1. Add the event listener in `index.js`
2. Create appropriate data formatting in `createEventData()`
3. Add webhook URL lookup for the channel
4. Send to n8n using `sendToN8n()`

## Troubleshooting

### Common Issues

1. **Bot not responding to slash commands**
   - Ensure the bot has the "Use Slash Commands" permission
   - Check that `CLIENT_ID` is set correctly
   - Verify the bot is online

2. **Database connection errors**
   - Check `DATABASE_URL` format
   - Ensure PostgreSQL is running
   - Verify SSL settings for production

3. **Webhook not receiving data**
   - Check webhook URL format (must start with https://)
   - Verify n8n webhook is active
   - Check bot logs for error messages

### Logs

The bot provides detailed logging for:
- Command execution
- Database operations
- Webhook deliveries
- Error conditions

Check Railway logs for debugging information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see package.json for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs
3. Open an issue on GitHub

---

**Note**: This bot requires appropriate Discord permissions and a valid n8n webhook URL to function properly. 