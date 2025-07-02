require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    SlashCommandBuilder, 
    REST, 
    Routes,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');
const { initDatabase, db } = require('./database');
const cron = require('node-cron');
const http = require('http');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// Register slash commands
const registerCommands = async () => {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
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
const sendToN8n = async (data, eventType, webhookUrl) => {
    try {
        const payload = {
            event_type: eventType,
            timestamp: Date.now(),
            ...data
        };

        // Log the payload in a readable format
        console.log('\nSending to n8n:');
        console.log('Event Type:', eventType);
        console.log('Webhook URL:', webhookUrl);
        console.log('Timestamp:', new Date(payload.timestamp).toISOString());
        console.log('Payload:', JSON.stringify(payload, null, 2));
        console.log('----------------------------------------');

        await axios.post(webhookUrl, payload);
        console.log(`Successfully forwarded ${eventType} to n8n`);
    } catch (error) {
        console.error(`Error forwarding ${eventType} to n8n:`, error);
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
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}:`, error);
        await interaction.reply({ 
            content: 'An error occurred while processing your command.', 
            ephemeral: true 
        });
    }
});

const handleSetupCommand = async (interaction) => {
    const webhookUrl = interaction.options.getString('webhook_url');
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    // Validate webhook URL
    if (!webhookUrl.startsWith('https://')) {
        await interaction.reply({ 
            content: '❌ Invalid webhook URL. Please provide a valid HTTPS URL.', 
            ephemeral: true 
        });
        return;
    }

    try {
        await db.setChannelWebhook(channelId, webhookUrl, guildId);
        await db.storeGuild(guildId, interaction.guild.name);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Webhook Setup Complete')
            .setDescription(`Successfully configured n8n webhook for <#${channelId}>`)
            .addFields(
                { name: 'Channel', value: `<#${channelId}>`, inline: true },
                { name: 'Webhook URL', value: webhookUrl, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error setting up webhook:', error);
        await interaction.reply({ 
            content: '❌ Failed to set up webhook. Please try again.', 
            ephemeral: true 
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

    try {
        const webhookUrl = await db.getChannelWebhook(channelId);
        
        const embed = new EmbedBuilder()
            .setColor(webhookUrl ? '#00ff00' : '#ff0000')
            .setTitle('📊 Channel Status')
            .setDescription(`Status for <#${channelId}>`)
            .addFields(
                { 
                    name: 'Status', 
                    value: webhookUrl ? '✅ Configured' : '❌ Not configured', 
                    inline: true 
                }
            )
            .setTimestamp();

        if (webhookUrl) {
            embed.addFields({ 
                name: 'Webhook URL', 
                value: webhookUrl, 
                inline: false 
            });
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
            embed.addFields({
                name: `Channel ${index + 1}`,
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
        
        await sendToN8n(messageData, eventType, webhookUrl);
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
        
        await sendToN8n(reactionData, fullEventType, webhookUrl);
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
        await sendToN8n(threadData, 'thread_create', webhookUrl);
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
        await sendToN8n(threadData, 'thread_delete', webhookUrl);
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
        await sendToN8n(threadData, 'thread_update', webhookUrl);
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
        await sendToN8n(threadData, 'thread_member_join', webhookUrl);
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
        await sendToN8n(threadData, 'thread_member_leave', webhookUrl);
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
            console.log('Running scheduled backup...');
            try {
                const { createBackup, pushToGitHub, cleanupOldBackups } = require('./backup');
                const backupFile = await createBackup();
                await pushToGitHub(backupFile);
                cleanupOldBackups();
                console.log('Scheduled backup completed successfully');
            } catch (error) {
                console.error('Scheduled backup failed:', error);
            }
        });
        
        console.log('Bot is ready and database backup is scheduled!');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Handle errors
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.destroy();
    process.exit(0);
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN); 