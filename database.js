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
        const columnsToAdd = [
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0',
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMP',
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true',
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS disabled_reason TEXT',
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS registered_by_user_id VARCHAR(20)',
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS registered_by_username VARCHAR(100)',
            'ALTER TABLE channel_webhooks ADD COLUMN IF NOT EXISTS send_bot_messages BOOLEAN DEFAULT false'
        ];

        for (const columnQuery of columnsToAdd) {
            await client.query(columnQuery);
        }

        // Create guilds table for additional server info
        await client.query(`
            CREATE TABLE IF NOT EXISTS guilds (
                id VARCHAR(20) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                added_by_user_id VARCHAR(20),
                added_by_username VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create server_admins table for normalized user tracking
        await client.query(`
            CREATE TABLE IF NOT EXISTS server_admins (
                user_id VARCHAR(20) PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                display_name VARCHAR(100),
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                interaction_count INTEGER DEFAULT 1
            )
        `);

        // Add foreign key reference to server_admins (clean approach)
        await client.query(`
            ALTER TABLE channel_webhooks 
            ADD COLUMN IF NOT EXISTS registered_by_admin_id VARCHAR(20)
        `);
        
        await client.query(`
            ALTER TABLE guilds 
            ADD COLUMN IF NOT EXISTS added_by_admin_id VARCHAR(20)
        `);

        // Drop redundant columns if they exist (safe cleanup)
        await client.query(`
            ALTER TABLE channel_webhooks 
            DROP COLUMN IF EXISTS registered_by_user_id,
            DROP COLUMN IF EXISTS registered_by_username
        `);
        
        await client.query(`
            ALTER TABLE guilds 
            DROP COLUMN IF EXISTS added_by_user_id,
            DROP COLUMN IF EXISTS added_by_username
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
                'SELECT webhook_url, is_active, failure_count, send_bot_messages FROM channel_webhooks WHERE channel_id = $1 AND is_active = true',
                [channelId]
            );
            const DEBUG = process.env.DEBUG === 'true';
            
            if (DEBUG) {
                // Also check if there's ANY webhook for this channel (active or inactive)
                const allResult = await pool.query(
                    'SELECT webhook_url, is_active, failure_count, disabled_reason, send_bot_messages FROM channel_webhooks WHERE channel_id = $1',
                    [channelId]
                );
                
                if (allResult.rows[0]) {
                    const webhook = allResult.rows[0];
                    console.log(`[DEBUG] 🔍 Webhook found for channel ${channelId}:`);
                    console.log(`[DEBUG] - Active: ${webhook.is_active}`);
                    console.log(`[DEBUG] - Failures: ${webhook.failure_count}`);
                    console.log(`[DEBUG] - Disabled reason: "${webhook.disabled_reason || 'none'}"`);
                    console.log(`[DEBUG] - URL: ${webhook.webhook_url}`);
                    if (!webhook.is_active) {
                        console.log(`[DEBUG] ⚠️ 🚫 WEBHOOK IS DISABLED - This is why messages aren't forwarding!`);
                        console.log(`[DEBUG] 🔧 To fix: Use /setup command with the webhook URL to re-enable it`);
                    }
                } else {
                    console.log(`[DEBUG] ❌ No webhook configured at all for channel ${channelId}`);
                }
            }
            
            if (DEBUG && result.rows[0]) {
                console.log(`[DEBUG] Found ACTIVE webhook for channel ${channelId}: failures=${result.rows[0].failure_count}`);
            }
            
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting channel webhook:', error);
            return null;
        }
    },

    // Set webhook URL for a channel
    setChannelWebhook: async (channelId, webhookUrl, guildId, userId = null, username = null) => {
        try {
            // Track the admin first (inline to avoid circular reference)
            if (userId && username) {
                const adminUpsert = await pool.query(`
                    INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        username = EXCLUDED.username,
                        display_name = EXCLUDED.display_name,  
                        last_seen = CURRENT_TIMESTAMP,
                        interaction_count = server_admins.interaction_count + 1
                    RETURNING *
                `, [userId, username, null]);
                
                const adminResult = adminUpsert.rows[0];
                const isNew = adminResult.interaction_count === 1;
                if (isNew) {
                    console.log(`👤 New admin added: ${username} (${userId})`);
                }
            }
            
            const result = await pool.query(`
                INSERT INTO channel_webhooks (channel_id, webhook_url, guild_id, registered_by_admin_id, send_bot_messages)
                VALUES ($1, $2, $3, $4, false)
                ON CONFLICT (channel_id)
                DO UPDATE SET
                    webhook_url = EXCLUDED.webhook_url,
                    guild_id = EXCLUDED.guild_id,
                    registered_by_admin_id = EXCLUDED.registered_by_admin_id,
                    is_active = true,
                    failure_count = 0,
                    disabled_reason = NULL,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [channelId, webhookUrl, guildId, userId]);
            
            console.log(`🔗 New channel webhook setup: ${webhookUrl}`);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error setting channel webhook:', error);
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
    storeGuild: async (guildId, guildName, userId = null, username = null) => {
        try {
            // Track the admin first (inline to avoid circular reference)
            if (userId && username) {
                const adminUpsert = await pool.query(`
                    INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        username = EXCLUDED.username,
                        display_name = EXCLUDED.display_name,  
                        last_seen = CURRENT_TIMESTAMP,
                        interaction_count = server_admins.interaction_count + 1
                    RETURNING *
                `, [userId, username, null]);
                
                const adminResult = adminUpsert.rows[0];
                const isNew = adminResult.interaction_count === 1;
                if (isNew) {
                    console.log(`👤 New admin added: ${username} (${userId})`);
                }
            }
            
            await pool.query(`
                INSERT INTO guilds (id, name, added_by_admin_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (id) 
                DO UPDATE SET 
                    name = EXCLUDED.name,
                    added_by_admin_id = EXCLUDED.added_by_admin_id,  
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId, guildName, userId]);
            
            console.log(`🏰 New server added: ${guildName}`);
        } catch (error) {
            console.error('❌ Error storing guild:', error);
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
    recordWebhookFailure: async (channelId, errorMessage, immediateDisable = false, countTowardsLimit = true) => {
        try {
            const MAX_FAILURES = 5; // Disable after 5 consecutive failures
            
            // Note: immediateDisable parameter is kept for backward compatibility but ignored
            // All webhooks are only disabled after reaching 5 consecutive failures
            
            // Only count certain errors towards the failure limit
            if (!countTowardsLimit) {
                // Just update last_failure_at but don't increment counter for temporary errors
                await pool.query(`
                    UPDATE channel_webhooks 
                    SET 
                        last_failure_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE channel_id = $1
                `, [channelId]);
                
                const DEBUG = process.env.DEBUG === 'true';
                if (DEBUG) {
                    console.log(`[DEBUG] ⚠️ Temporary error (not counted): ${errorMessage}`);
                } else {
                    console.log(`⚠️ Temporary error (not counted): ${errorMessage}`);
                }
                return { disabled: false, temporary: true };
            }
            
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
                
                const DEBUG = process.env.DEBUG === 'true';
                if (DEBUG) {
                    console.warn(`[DEBUG] 🚫 Webhook auto-disabled after ${MAX_FAILURES} consecutive failures: ${errorMessage}`);
                } else {
                    console.warn(`🚫 Webhook auto-disabled after ${MAX_FAILURES} consecutive failures`);
                }
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
            const result = await pool.query(`
                UPDATE channel_webhooks 
                SET 
                    failure_count = 0,
                    last_failure_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE channel_id = $1
                RETURNING failure_count
            `, [channelId]);
            
            const DEBUG = process.env.DEBUG === 'true';
            if (DEBUG && result.rows[0]) {
                console.log(`[DEBUG] Reset failure count for channel ${channelId} to 0`);
            }
        } catch (error) {
            console.error('Error recording webhook success:', error);
        }
    },

    // Check if user info exists for a webhook, update if missing (backwards compatibility)
    updateWebhookUserInfo: async (channelId, userId, username) => {
        try {
            // Track the admin first (inline to avoid circular reference)
            if (userId && username) {
                const adminUpsert = await pool.query(`
                    INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        username = EXCLUDED.username,
                        display_name = EXCLUDED.display_name,  
                        last_seen = CURRENT_TIMESTAMP,
                        interaction_count = server_admins.interaction_count + 1
                    RETURNING *
                `, [userId, username, null]);
                
                const adminResult = adminUpsert.rows[0];
                const isNew = adminResult.interaction_count === 1;
                if (isNew) {
                    console.log(`👤 New admin added: ${username} (${userId})`);
                }
            }
            
            const result = await pool.query(`
                UPDATE channel_webhooks 
                SET 
                    registered_by_admin_id = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE channel_id = $1 AND registered_by_admin_id IS NULL
                RETURNING *
            `, [channelId, userId]);
            
            if (result.rows[0]) {
                console.log(`👤 Admin assigned to channel webhook`);
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error updating webhook user info:', error);
            return null;
        }
    },

    // Check if guild has user info, update if missing (backwards compatibility)
    updateGuildUserInfo: async (guildId, userId, username) => {
        try {
            // Track the admin first (inline to avoid circular reference)
            if (userId && username) {
                const adminUpsert = await pool.query(`
                    INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        username = EXCLUDED.username,
                        display_name = EXCLUDED.display_name,  
                        last_seen = CURRENT_TIMESTAMP,
                        interaction_count = server_admins.interaction_count + 1
                    RETURNING *
                `, [userId, username, null]);
                
                const adminResult = adminUpsert.rows[0];
                const isNew = adminResult.interaction_count === 1;
                if (isNew) {
                    console.log(`👤 New admin added: ${username} (${userId})`);
                }
            }
            
            const result = await pool.query(`
                UPDATE guilds 
                SET 
                    added_by_admin_id = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND added_by_admin_id IS NULL
                RETURNING *
            `, [guildId, userId]);
            
            if (result.rows[0]) {
                console.log(`👤 Admin assigned to server`);
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error updating guild user info:', error);
            return null;
        }
    },

    // Get webhook info including user details
    getWebhookDetails: async (channelId) => {
        try {
            const result = await pool.query(
                'SELECT * FROM channel_webhooks WHERE channel_id = $1',
                [channelId]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting webhook details:', error);
            return null;
        }
    },

    // Toggle bot messages setting for a channel
    toggleBotMessages: async (channelId) => {
        try {
            const result = await pool.query(
                'UPDATE channel_webhooks SET send_bot_messages = NOT send_bot_messages, updated_at = CURRENT_TIMESTAMP WHERE channel_id = $1 RETURNING send_bot_messages',
                [channelId]
            );
            return result.rows[0]?.send_bot_messages || false;
        } catch (error) {
            console.error('Error toggling bot messages setting:', error);
            return null;
        }
    },


};

module.exports = { pool, initDatabase, db }; 