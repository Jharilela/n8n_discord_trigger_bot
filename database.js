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
                failure_count INTEGER DEFAULT 0,
                last_failure_at TIMESTAMP,
                is_active BOOLEAN DEFAULT true,
                disabled_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add new columns to existing table if they don't exist
        await client.query(`
            ALTER TABLE channel_webhooks 
            ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS disabled_reason TEXT
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
    // Get webhook URL for a channel (only if active)
    getChannelWebhook: async (channelId) => {
        try {
            const result = await pool.query(
                'SELECT webhook_url FROM channel_webhooks WHERE channel_id = $1 AND is_active = true',
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
    },

    // Record webhook failure
    recordWebhookFailure: async (channelId, errorMessage) => {
        try {
            const MAX_FAILURES = 5; // Disable after 5 consecutive failures
            
            const result = await pool.query(`
                UPDATE channel_webhooks 
                SET 
                    failure_count = failure_count + 1,
                    last_failure_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE channel_id = $1 
                RETURNING failure_count, guild_id
            `, [channelId]);
            
            if (result.rows[0] && result.rows[0].failure_count >= MAX_FAILURES) {
                await pool.query(`
                    UPDATE channel_webhooks 
                    SET 
                        is_active = false,
                        disabled_reason = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE channel_id = $1
                `, [channelId, `Auto-disabled after ${MAX_FAILURES} consecutive failures: ${errorMessage}`]);
                
                console.warn(`🚫 Webhook auto-disabled for channel ${channelId} after ${MAX_FAILURES} failures`);
                return { disabled: true, guildId: result.rows[0].guild_id };
            }
            
            return { disabled: false, failureCount: result.rows[0].failure_count };
        } catch (error) {
            console.error('Error recording webhook failure:', error);
            return { disabled: false };
        }
    },

    // Record webhook success (reset failure count)
    recordWebhookSuccess: async (channelId) => {
        try {
            await pool.query(`
                UPDATE channel_webhooks 
                SET 
                    failure_count = 0,
                    last_failure_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE channel_id = $1
            `, [channelId]);
        } catch (error) {
            console.error('Error recording webhook success:', error);
        }
    },

};

module.exports = { pool, initDatabase, db }; 