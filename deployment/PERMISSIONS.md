# Discord Bot Permissions Guide

## Two-Bot Security Model

This project recommends using **two separate Discord bots** for maximum trust and security:

### 1. Public Bot: `n8n trigger bot`
- **Purpose:** Forwards messages/events from Discord to n8n (read-only, public use)
- **Permissions:** Minimal, read-only
- **Trust:** Cannot send messages or moderate, so users can safely add it to their servers

---

## Public Bot: `n8n trigger bot` (Read-Only, Public)

### **Required OAuth2 Scopes:**
- `bot`
- `applications.commands`

### **Required Bot Permissions:**
- ✅ **Read Messages/View Channels** (1024)
- ✅ **Read Message History** (65536)
- ✅ **Use Slash Commands** (scope, not a permission bit)

### **Recommended Invite Link:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=66560&scope=bot%20applications.commands
```
Where `66560` = 1024 (Read Messages) + 65536 (Read Message History)

### **DO NOT GRANT:**
- Send Messages
- Manage Channels
- Manage Messages
- Administrator
- Any moderation or write permissions

### **Why This Matters:**
- Users can verify the bot cannot send messages or moderate, increasing trust.
- The bot cannot be abused to spam or disrupt servers.

---

## How to Check/Set Permissions

### **Method 1: Discord Developer Portal**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to "Bot" section
4. Set the correct permissions and scopes

### **Method 2: Bot Invite Link**
Use the invite links above, replacing `YOUR_CLIENT_ID` with your bot's Application ID.

### **Method 3: Server Settings**
1. Go to your Discord server
2. Server Settings → Integrations → Bots and Apps
3. Find your bot and click "Configure"
4. Ensure only the required permissions are enabled

---

## Common Issues & Solutions

- **Slash commands not appearing:**
  - Check if bot has "Use Slash Commands" permission
  - Wait 1-5 minutes for commands to register
  - Restart the bot
  - Check Railway logs for command registration errors

- **Bot shows as offline:**
  - Check `DISCORD_TOKEN` is correct
  - Verify bot is added to server
  - Check Railway logs for connection errors

- **Commands appear but don't work:**
  - Check bot has required permissions in the specific channel
  - Verify user has required permissions (Manage Channels for setup commands)
  - Check Railway logs for command execution errors

---

## Security & Trust
- The public `n8n trigger bot` is designed to be as safe and non-intrusive as possible.
- It cannot send messages, moderate, or access more than is needed to forward events to n8n.
- Users are encouraged to review the bot's permissions before inviting it to their server.

---

## Permission Calculator

Use this to generate the correct permission bits for your use case:
- **Read Messages/View Channels**: 1024
- **Read Message History**: 65536
- **Send Messages**: 2048 (private bot only)
- **Manage Channels**: 16 (private bot only)
- **Manage Messages**: 8192 (private bot only)

**Total for public bot: 66560**

---

## Manual Command Registration

If commands still don't appear, you can manually register them:
1. Get your bot's application ID from Discord Developer Portal
2. Use Discord API to register commands manually
3. Or restart the bot - it should auto-register on startup

### **Testing Commands**

#### **Admin Commands (Administrator permission required)**
- `/stats` - Show bot statistics

#### **Manage Channels Commands (Manage Channels permission required)**
- `/setup` - Configure webhook for channel
- `/remove` - Remove webhook from channel
- `/status` - Check webhook status
- `/list` - List all webhooks in server

### **Debugging Steps**

1. **Check Railway Logs:**
   ```
   Railway Dashboard → Your Service → Deployments → Latest → Logs
   ```

2. **Look for these messages:**
   ```
   Started refreshing application (/) commands.
   Successfully reloaded application (/) commands.
   ```

3. **If you see errors:**
   - Check `CLIENT_ID` is correct
   - Verify bot token is valid
   - Ensure bot has proper permissions

### **Permission Calculator**

Use this to generate the correct permission bits:
- **Send Messages**: 2048
- **Use Slash Commands**: 2147483648
- **Read Message History**: 65536
- **Manage Channels**: 16
- **View Channels**: 1024

**Total for all required permissions: 2147541264** 