require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please set these variables in your environment or .env file');
    process.exit(1);
}

console.log('✅ All required environment variables are set');
console.log('Environment:', process.env.NODE_ENV || 'development');

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    SlashCommandBuilder, 
    REST, 
    Routes,
    EmbedBuilder,
    PermissionFlagsBits,
    InteractionResponseFlags
} = require('discord.js');
const axios = require('axios');
const { initDatabase, db } = require('./database');
const cron = require('node-cron');
const http = require('http');

// Utility function for ephemeral replies (fixes Discord.js deprecation warning)
const replyEphemeral = (interaction, options) => {
    return interaction.reply({
        ...options,
        flags: 64 // MessageFlags.Ephemeral
    });
};

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.ThreadMember, Partials.User]
});

// Slash command definitions
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Set up n8n webhook for this channel')
        .addStringOption(option =>
            option.setName('webhook_url')
                .setDescription('The n8n webhook URL for this channel')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove n8n webhook from this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show webhook status for this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('List all webhooks in this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show bot statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('privacy')
        .setDescription('View the bot privacy policy')
];

// Register slash commands
const registerCommands = async () => {
    try {
        console.log('=== SLASH COMMAND REGISTRATION ===');
        console.log('DISCORD_CLIENT_ID:', process.env.DISCORD_CLIENT_ID);
        console.log('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
        
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log('Started refreshing application (/) commands.');
        console.log('Commands to register:', commands.map(cmd => cmd.name));
        
        const result = await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
        console.log('Registered commands:', result.length);
        console.log('=== END SLASH COMMAND REGISTRATION ===');
    } catch (error) {
        console.error('Error registering commands:', error);
        console.error('Error details:', error.message);
        if (error.code) console.error('Error code:', error.code);
    }
};

// Utility functions for data formatting
const formatUser = (user) => ({
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    tag: user.tag
});

const formatChannel = (channel) => ({
    id: channel.id,
    name: channel.name,
    type: channel.type
});

const formatGuild = (guild) => guild ? {
    id: guild.id,
    name: guild.name
} : null;

const formatMessage = (message) => ({
    id: message.id,
    content: message.content,
    author: formatUser(message.author),
    channel: formatChannel(message.channel),
    guild: formatGuild(message.guild),
    timestamp: message.createdTimestamp
});

const formatReaction = (reaction) => ({
    emoji: reaction.emoji.toString(),
    emoji_id: reaction.emoji.id,
    emoji_name: reaction.emoji.name,
    animated: reaction.emoji.animated
});

// Function to determine message content type
const getContentType = (message) => {
    if (message.stickers.size > 0) return 'sticker';
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith('image/')) return 'image';
        if (attachment.contentType?.startsWith('video/')) return 'video';
        if (attachment.contentType?.startsWith('audio/')) return 'audio';
        return 'file';
    }
    if (message.embeds.length > 0) return 'embed';
    if (message.poll) return 'poll';
    if (message.reference) return 'reply';
    if (message.mentions.has(client.user)) return 'bot_mention';
    if (message.content.match(/https?:\/\/\S+/)) return 'link';
    if (message.content.trim() === '') return 'empty';
    return 'text';
};

// Function to send data to n8n webhook
const sendToN8n = async (data, eventType, webhookUrl, channelId) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    try {
        const payload = {
            event_type: eventType,
            timestamp: Date.now(),
            ...data
        };

        // Production logging shows event type and webhook URL but no payload content
        if (isProduction) {
            console.log(`${eventType} → ${webhookUrl}`);
        } else {
            console.log(`Sending ${eventType} to webhook for channel ${channelId}`);
        }

        await axios.post(webhookUrl, payload, { timeout: 10000 });
        
        // Record success - reset failure count
        await db.recordWebhookSuccess(channelId);
        
        if (!isProduction) {
            console.log(`✅ Successfully forwarded ${eventType} to n8n`);
        }
        
    } catch (error) {
        // Extract meaningful error information
        let errorMessage = 'Unknown error';
        let shouldDisable = false;
        
        if (error.response) {
            // HTTP error response (4xx, 5xx)
            const status = error.response.status;
            errorMessage = `HTTP ${status}: ${error.response.data?.message || error.response.statusText}`;
            
            // These errors indicate the webhook is permanently broken
            if (status === 404 || status === 410 || status === 403) {
                shouldDisable = true;
            }
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNABORTED') {
            // DNS or timeout errors - might be temporary
            errorMessage = `Connection error: ${error.code}`;
        } else {
            errorMessage = error.message;
        }
        
        // Always log errors but with less detail in production
        if (isProduction) {
            console.error(`Webhook error for channel ${channelId}: ${error.response?.status || error.code}`);
        } else {
            console.error(`❌ Error forwarding ${eventType} to webhook (channel ${channelId}): ${errorMessage}`);
        }
        
        // Record the failure in database
        const result = await db.recordWebhookFailure(channelId, errorMessage, shouldDisable);
        
        if (result.disabled) {
            console.warn(`🚫 Webhook for channel ${channelId} auto-disabled after repeated failures`);
        } else if (result.failureCount && !isProduction) {
            console.warn(`⚠️  Webhook failure count for channel ${channelId}: ${result.failureCount}/5`);
        }
    }
};

// Unified data structure creator
const createEventData = (event, eventType, options = {}) => {
    const {
        isThread = false,
        isReaction = false,
        isThreadEvent = false,
        changes = null,
        author = null
    } = options;

    // Get the appropriate channel and thread objects
    let channel, thread;
    if (isReaction) {
        // For reactions, we need to handle both thread and non-thread cases
        const messageChannel = event.message.channel;
        if (messageChannel.isThread()) {
            channel = messageChannel.parent;
            thread = messageChannel;
        } else {
            channel = messageChannel;
            thread = null;
        }
    } else {
        // For other events
        channel = isThread ? event.channel.parent : event.channel;
        thread = isThread ? event.channel : null;
    }

    const message = isReaction ? event.message : event;
    const eventAuthor = author || event.author || event.user;

    // Base data structure
    const data = {
        content: {
            text: isReaction ? event.emoji.toString() : 
                  isThreadEvent ? (eventType.includes('member') ? 
                    `${eventAuthor.tag} ${eventType.includes('join') ? 'joined' : 'left'} the thread` : 
                    event.name) : 
                  message.content,
            type: eventType
        },
        author: {
            id: eventAuthor.id,
            username: eventAuthor.username || 'Unknown',
            discriminator: eventAuthor.discriminator || '0000'
        },
        channel: {
            id: channel?.id || 'unknown',
            name: channel?.name || 'Unknown',
            type: channel?.type || 'text'
        },
        guild: message.guild ? {
            id: message.guild.id,
            name: message.guild.name
        } : null,
        message_id: message.id,
        original_message: message,
        timestamp: Date.now()
    };

    // Add thread data if it's a thread event or message in thread
    if (thread) {
        data.thread = {
            id: thread.id,
            name: thread.name,
            type: thread.type,
            archived: thread.archived,
            auto_archive_duration: thread.autoArchiveDuration,
            locked: thread.locked,
            parent_id: thread.parentId,
            rate_limit_per_user: thread.rateLimitPerUser
        };
    }

    // Add reaction data if it's a reaction event
    if (isReaction) {
        data.reaction = {
            emoji: event.emoji.toString(),
            emoji_id: event.emoji.id,
            emoji_name: event.emoji.name,
            animated: event.emoji.animated
        };
    }

    // Add changes if it's a thread update event
    if (changes) {
        data.changes = changes;
    }

    return data;
};

// Slash command handlers
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                await handleSetupCommand(interaction);
                break;
            case 'remove':
                await handleRemoveCommand(interaction);
                break;
            case 'status':
                await handleStatusCommand(interaction);
                break;
            case 'list':
                await handleListCommand(interaction);
                break;
            case 'stats':
                await handleStatsCommand(interaction);
                break;
            case 'privacy':
                await handlePrivacyCommand(interaction);
                break;
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}:`, error);
        await replyEphemeral(interaction, { 
            content: 'An error occurred while processing your command.' 
        });
    }
});

const handleSetupCommand = async (interaction) => {
    const webhookUrl = interaction.options.getString('webhook_url');
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    // Validate webhook URL
    if (!webhookUrl.startsWith('https://')) {
        await replyEphemeral(interaction, { 
            content: '❌ Invalid webhook URL. Please provide a valid HTTPS URL.' 
        });
        return;
    }

    // Acknowledge interaction immediately to prevent timeout
    await replyEphemeral(interaction, { 
        content: '⏳ Testing webhook connection and setting up...' 
    });

    // Test the webhook by sending a POST request
    try {
        const testPayload = {
            event_type: 'test_webhook',
            message: 'This is a test from your Discord bot setup. If you see this, your webhook is working!'
        };
        const response = await axios.post(webhookUrl, testPayload, { timeout: 3000 });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Received status code ${response.status}`);
        }
    } catch (error) {
        let errorMsg = '❌ Failed to reach the webhook URL. Please check that your n8n webhook is online and publicly accessible.';
        if (error.response) {
            errorMsg += `\nStatus: ${error.response.status}`;
        } else if (error.code === 'ECONNABORTED') {
            errorMsg += '\nRequest timed out.';
        } else {
            errorMsg += `\nError: ${error.message}`;
        }
        await interaction.editReply({ content: errorMsg });
        return;
    }

    try {
        // Capture user information for security tracking
        const userId = interaction.user.id;
        const username = interaction.user.tag;
        
        await db.setChannelWebhook(channelId, webhookUrl, guildId, userId, username);
        await db.storeGuild(guildId, interaction.guild.name, userId, username);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Webhook Setup Complete')
            .setDescription(`Successfully configured n8n webhook for <#${channelId}>`)
            .addFields(
                { name: 'Channel', value: `<#${channelId}>`, inline: true },
                { name: 'Webhook URL', value: webhookUrl, inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error setting up webhook:', error);
        await interaction.editReply({ 
            content: '❌ Failed to set up webhook. Please try again.'
        });
    }
};

const handleRemoveCommand = async (interaction) => {
    const channelId = interaction.channelId;

    try {
        const removed = await db.removeChannelWebhook(channelId);
        
        if (removed) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🗑️ Webhook Removed')
                .setDescription(`Successfully removed n8n webhook from <#${channelId}>`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ 
                content: '❌ No webhook was configured for this channel.', 
                ephemeral: true 
            });
        }
    } catch (error) {
        console.error('Error removing webhook:', error);
        await interaction.reply({ 
            content: '❌ Failed to remove webhook. Please try again.', 
            ephemeral: true 
        });
    }
};

const handleStatusCommand = async (interaction) => {
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    try {
        // Get detailed webhook info (including user tracking)
        const webhookDetails = await db.getWebhookDetails(channelId);
        
        // Backwards compatibility: Update user info if missing
        if (webhookDetails && !webhookDetails.registered_by_user_id) {
            await db.updateWebhookUserInfo(channelId, interaction.user.id, interaction.user.tag);
            await db.updateGuildUserInfo(guildId, interaction.user.id, interaction.user.tag);
        }
        
        const embed = new EmbedBuilder()
            .setColor(webhookDetails?.is_active ? '#00ff00' : '#ff0000')
            .setTitle('📊 Channel Status')
            .setDescription(`Status for <#${channelId}>`)
            .addFields(
                { 
                    name: 'Status', 
                    value: webhookDetails?.is_active ? '✅ Configured' : '❌ Not configured', 
                    inline: true 
                }
            )
            .setTimestamp();

        if (webhookDetails) {
            embed.addFields({ 
                name: 'Webhook URL', 
                value: webhookDetails.webhook_url, 
                inline: false 
            });

            if (webhookDetails.failure_count > 0) {
                embed.addFields({
                    name: 'Warning',
                    value: `⚠️ ${webhookDetails.failure_count}/5 failures recorded`,
                    inline: true
                });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting status:', error);
        await interaction.reply({ 
            content: '❌ Failed to get status. Please try again.', 
            ephemeral: true 
        });
    }
};

const handleListCommand = async (interaction) => {
    const guildId = interaction.guildId;

    try {
        const webhooks = await db.getGuildWebhooks(guildId);
        
        // Backwards compatibility: Update guild user info if missing
        await db.updateGuildUserInfo(guildId, interaction.user.id, interaction.user.tag);
        
        if (webhooks.length === 0) {
            await interaction.reply({ 
                content: '❌ No webhooks configured in this server.', 
                ephemeral: true 
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📋 Configured Webhooks')
            .setDescription(`Found ${webhooks.length} webhook(s) in this server`)
            .setTimestamp();

        webhooks.forEach((webhook, index) => {
            const statusEmoji = webhook.is_active ? '✅' : '❌';
            const warningText = webhook.failure_count > 0 ? ` (⚠️ ${webhook.failure_count} failures)` : '';
            
            embed.addFields({
                name: `${statusEmoji} Channel ${index + 1}${warningText}`,
                value: `<#${webhook.channel_id}>\n${webhook.webhook_url}`,
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing webhooks:', error);
        await interaction.reply({ 
            content: '❌ Failed to list webhooks. Please try again.', 
            ephemeral: true 
        });
    }
};

const handleStatsCommand = async (interaction) => {
    try {
        // Backwards compatibility: Update guild user info if missing
        const guildId = interaction.guildId;
        if (guildId) {
            await db.updateGuildUserInfo(guildId, interaction.user.id, interaction.user.tag);
        }
        
        const stats = await db.getStats();
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📊 Bot Statistics')
            .addFields(
                { name: 'Total Webhooks', value: stats.webhookCount.toString(), inline: true },
                { name: 'Total Servers', value: stats.guildCount.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting stats:', error);
        await interaction.reply({ 
            content: '❌ Failed to get statistics. Please try again.', 
            ephemeral: true 
        });
    }
};

const handlePrivacyCommand = async (interaction) => {
    try {
        // Backwards compatibility: Update guild user info if missing
        const guildId = interaction.guildId;
        if (guildId) {
            await db.updateGuildUserInfo(guildId, interaction.user.id, interaction.user.tag);
        }
        
        const fs = require('fs');
        const path = require('path');
        
        const privacyPolicyPath = path.join(__dirname, 'PRIVACY_POLICY.md');
        
        if (!fs.existsSync(privacyPolicyPath)) {
            await interaction.reply({ 
                content: '❌ Privacy policy file not found.', 
                ephemeral: true 
            });
            return;
        }
        
        const privacyContent = fs.readFileSync(privacyPolicyPath, 'utf8');
        
        // Discord embeds have a 4096 character limit for descriptions
        // If content is too long, we'll truncate and provide a link
        if (privacyContent.length > 4000) {
            const truncatedContent = privacyContent.substring(0, 4000) + '...';
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔒 Privacy Policy')
                .setDescription('```\n' + truncatedContent + '\n```')
                .addFields({
                    name: 'Full Policy',
                    value: 'The full privacy policy is available in the bot\'s repository.',
                    inline: false
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔒 Privacy Policy')
                .setDescription('```\n' + privacyContent + '\n```')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling privacy command:', error);
        await interaction.reply({ 
            content: '❌ Failed to load privacy policy. Please try again.', 
            ephemeral: true 
        });
    }
};

// Message handler with per-channel webhook routing
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        // Get webhook URL for this channel
        const webhookUrl = await db.getChannelWebhook(message.channelId);
        
        if (!webhookUrl) {
            // No webhook configured for this channel, skip processing
            return;
        }

        const isThread = message.channel.isThread();
        const eventType = isThread ? 'thread_message' : 'message_create';
        const messageData = createEventData(message, eventType, { isThread });
        
        await sendToN8n(messageData, eventType, webhookUrl, message.channelId);
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Reaction handler with per-channel webhook routing
const handleReaction = async (reaction, user, eventType) => {
    if (user.bot) return;

    // Fetch partial data if needed
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
        }
    }

    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            console.error('Error fetching message:', error);
            return;
        }
    }

    try {
        // Get webhook URL for this channel
        const webhookUrl = await db.getChannelWebhook(reaction.message.channelId);
        
        if (!webhookUrl) {
            // No webhook configured for this channel, skip processing
            return;
        }

        const isThread = reaction.message.channel.isThread();
        const fullEventType = isThread ? `thread_${eventType}` : eventType;
        const reactionData = createEventData(reaction, fullEventType, { 
            isThread, 
            isReaction: true,
            author: user 
        });
        
        await sendToN8n(reactionData, fullEventType, webhookUrl, reaction.message.channelId);
    } catch (error) {
        console.error(`Error processing ${eventType}:`, error);
    }
};

// Thread event handlers with per-channel webhook routing
client.on('threadCreate', async (thread) => {
    try {
        const webhookUrl = await db.getChannelWebhook(thread.parentId);
        
        if (!webhookUrl) {
            return;
        }

        const threadData = createEventData(thread, 'thread_create', { isThreadEvent: true });
        await sendToN8n(threadData, 'thread_create', webhookUrl, thread.parentId);
    } catch (error) {
        console.error('Error processing thread creation:', error);
    }
});

client.on('threadDelete', async (thread) => {
    try {
        const webhookUrl = await db.getChannelWebhook(thread.parentId);
        
        if (!webhookUrl) {
            return;
        }

        const threadData = createEventData(thread, 'thread_delete', { isThreadEvent: true });
        await sendToN8n(threadData, 'thread_delete', webhookUrl, thread.parentId);
    } catch (error) {
        console.error('Error processing thread deletion:', error);
    }
});

client.on('threadUpdate', async (oldThread, newThread) => {
    try {
        const webhookUrl = await db.getChannelWebhook(newThread.parentId);
        
        if (!webhookUrl) {
            return;
        }

        const changes = {
            name: oldThread.name !== newThread.name ? {
                old: oldThread.name,
                new: newThread.name
            } : null,
            archived: oldThread.archived !== newThread.archived ? {
                old: oldThread.archived,
                new: newThread.archived
            } : null,
            locked: oldThread.locked !== newThread.locked ? {
                old: oldThread.locked,
                new: newThread.locked
            } : null,
            auto_archive_duration: oldThread.autoArchiveDuration !== newThread.autoArchiveDuration ? {
                old: oldThread.autoArchiveDuration,
                new: newThread.autoArchiveDuration
            } : null,
            rate_limit_per_user: oldThread.rateLimitPerUser !== newThread.rateLimitPerUser ? {
                old: oldThread.rateLimitPerUser,
                new: newThread.rateLimitPerUser
            } : null
        };

        const threadData = createEventData(newThread, 'thread_update', { 
            isThreadEvent: true,
            changes 
        });
        await sendToN8n(threadData, 'thread_update', webhookUrl, newThread.parentId);
    } catch (error) {
        console.error('Error processing thread update:', error);
    }
});

client.on('threadMemberAdd', async (member) => {
    try {
        const webhookUrl = await db.getChannelWebhook(member.thread.parentId);
        
        if (!webhookUrl) {
            return;
        }

        const threadData = createEventData(member.thread, 'thread_member_join', { 
            isThreadEvent: true,
            author: member.user 
        });
        await sendToN8n(threadData, 'thread_member_join', webhookUrl, member.thread.parentId);
    } catch (error) {
        console.error('Error processing thread member join:', error);
    }
});

client.on('threadMemberRemove', async (member) => {
    try {
        const webhookUrl = await db.getChannelWebhook(member.thread.parentId);
        
        if (!webhookUrl) {
            return;
        }

        const threadData = createEventData(member.thread, 'thread_member_leave', { 
            isThreadEvent: true,
            author: member.user 
        });
        await sendToN8n(threadData, 'thread_member_leave', webhookUrl, member.thread.parentId);
    } catch (error) {
        console.error('Error processing thread member leave:', error);
    }
});

// Reaction event listeners
client.on('messageReactionAdd', (reaction, user) => handleReaction(reaction, user, 'reaction_add'));
client.on('messageReactionRemove', (reaction, user) => handleReaction(reaction, user, 'reaction_remove'));

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        status: 'ok', 
        bot: client.user ? 'connected' : 'connecting',
        timestamp: new Date().toISOString()
    }));
});

// Start HTTP server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    try {
        // Initialize database
        await initDatabase();
        
        // Register slash commands
        await registerCommands();
        
        // Set up hourly backup cron job
        cron.schedule('0 * * * *', async () => {
            console.log('Running scheduled CSV backup...');
            try {
                const { exportToCSV, pushToGitHub, cleanupOldBackups } = require('./backup');
                const backupDir = await exportToCSV();
                await pushToGitHub(backupDir);
                cleanupOldBackups();
                console.log('Scheduled CSV backup completed successfully');
            } catch (error) {
                console.error('Scheduled CSV backup failed:', error);
            }
        });
        
        console.log('Bot is ready and database backup is scheduled!');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Handle guild join events to track who adds the bot
client.on('guildCreate', async (guild) => {
    console.log(`Bot added to guild: ${guild.name} (${guild.id})`);
    
    try {
        // Note: We can't determine who invited the bot from the guildCreate event
        // User information will be captured when they first interact with slash commands
        await db.storeGuild(guild.id, guild.name);
        console.log(`✅ Stored guild information for ${guild.name}`);
    } catch (error) {
        console.error('Error storing guild information:', error);
    }
});

// Handle errors
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Handle process termination gracefully
const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    
    try {
        // Close HTTP server
        if (server) {
            server.close(() => {
                console.log('HTTP server closed');
            });
        }
        
        // Destroy Discord client
        if (client) {
            client.destroy();
            console.log('Discord client destroyed');
        }
        
        // Close database connections
        if (pool) {
            await pool.end();
            console.log('Database connections closed');
        }
        
        console.log('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

// Handle different termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login to Discord:', error);
    process.exit(1);
}); 