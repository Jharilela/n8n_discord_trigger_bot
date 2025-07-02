# Discord Bot Permissions Guide

## Required Permissions for Slash Commands

Your Discord bot needs these permissions to work properly:

### **Bot Permissions**
- ✅ **Send Messages**
- ✅ **Use Slash Commands** (Most Important!)
- ✅ **Read Message History**
- ✅ **Manage Channels** (for webhook setup)
- ✅ **View Channels**

### **How to Check/Set Permissions**

#### **Method 1: Discord Developer Portal**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to "Bot" section
4. Scroll down to "Privileged Gateway Intents"
5. Enable:
   - **Message Content Intent**
   - **Server Members Intent**
   - **Presence Intent**

#### **Method 2: Bot Invite Link**
Use this invite link (replace `YOUR_CLIENT_ID` with your actual client ID):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147483648&scope=bot%20applications.commands
```

#### **Method 3: Server Settings**
1. Go to your Discord server
2. Server Settings → Integrations → Bots and Apps
3. Find your bot and click "Configure"
4. Ensure these permissions are enabled:
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - Manage Channels

### **Common Issues & Solutions**

#### **Issue: Slash commands not appearing**
**Solution:**
1. Check if bot has "Use Slash Commands" permission
2. Wait 1-5 minutes for commands to register
3. Restart the bot
4. Check Railway logs for command registration errors

#### **Issue: Bot shows as offline**
**Solution:**
1. Check `DISCORD_TOKEN` is correct
2. Verify bot is added to server
3. Check Railway logs for connection errors

#### **Issue: Commands appear but don't work**
**Solution:**
1. Check bot has required permissions in the specific channel
2. Verify user has required permissions (Manage Channels for setup commands)
3. Check Railway logs for command execution errors

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

### **Manual Command Registration**

If commands still don't appear, you can manually register them:

1. **Get your bot's application ID** from Discord Developer Portal
2. **Use Discord API** to register commands manually
3. **Or restart the bot** - it should auto-register on startup

### **Permission Calculator**

Use this to generate the correct permission bits:
- **Send Messages**: 2048
- **Use Slash Commands**: 2147483648
- **Read Message History**: 65536
- **Manage Channels**: 16
- **View Channels**: 1024

**Total for all required permissions: 2147541264** 