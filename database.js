const { Pool } = require('pg');

// Create a connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
const initDatabase = async () => {
    try {
        const client = await pool.connect();
        
        // Create channel_webhooks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS channel_webhooks (
                id SERIAL PRIMARY KEY,
                channel_id VARCHAR(20) UNIQUE NOT NULL,
                webhook_url TEXT NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create guilds table for additional server info
        await client.query(`
            CREATE TABLE IF NOT EXISTS guilds (
                id VARCHAR(20) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        client.release();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};

// Database operations
const db = {
    // Get webhook URL for a channel
    getChannelWebhook: async (channelId) => {
        try {
            const result = await pool.query(
                'SELECT webhook_url FROM channel_webhooks WHERE channel_id = $1',
                [channelId]
            );
            return result.rows[0]?.webhook_url || null;
        } catch (error) {
            console.error('Error getting channel webhook:', error);
            return null;
        }
    },

    // Set webhook URL for a channel
    setChannelWebhook: async (channelId, webhookUrl, guildId) => {
        try {
            const result = await pool.query(`
                INSERT INTO channel_webhooks (channel_id, webhook_url, guild_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (channel_id) 
                DO UPDATE SET 
                    webhook_url = EXCLUDED.webhook_url,
                    guild_id = EXCLUDED.guild_id,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [channelId, webhookUrl, guildId]);
            
            return result.rows[0];
        } catch (error) {
            console.error('Error setting channel webhook:', error);
            throw error;
        }
    },

    // Remove webhook for a channel
    removeChannelWebhook: async (channelId) => {
        try {
            const result = await pool.query(
                'DELETE FROM channel_webhooks WHERE channel_id = $1 RETURNING *',
                [channelId]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error removing channel webhook:', error);
            throw error;
        }
    },

    // Get all webhooks for a guild
    getGuildWebhooks: async (guildId) => {
        try {
            const result = await pool.query(
                'SELECT * FROM channel_webhooks WHERE guild_id = $1 ORDER BY created_at DESC',
                [guildId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting guild webhooks:', error);
            return [];
        }
    },

    // Store guild information
    storeGuild: async (guildId, guildName) => {
        try {
            await pool.query(`
                INSERT INTO guilds (id, name)
                VALUES ($1, $2)
                ON CONFLICT (id) 
                DO UPDATE SET 
                    name = EXCLUDED.name,
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId, guildName]);
        } catch (error) {
            console.error('Error storing guild:', error);
        }
    },

    // Get database statistics
    getStats: async () => {
        try {
            const webhookCount = await pool.query('SELECT COUNT(*) FROM channel_webhooks');
            const guildCount = await pool.query('SELECT COUNT(*) FROM guilds');
            
            return {
                webhookCount: parseInt(webhookCount.rows[0].count),
                guildCount: parseInt(guildCount.rows[0].count)
            };
        } catch (error) {
            console.error('Error getting stats:', error);
            return { webhookCount: 0, guildCount: 0 };
        }
    }
};

module.exports = { pool, initDatabase, db }; 