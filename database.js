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
            ADD COLUMN IF NOT EXISTS disabled_reason TEXT,
            ADD COLUMN IF NOT EXISTS registered_by_user_id VARCHAR(20),
            ADD COLUMN IF NOT EXISTS registered_by_username VARCHAR(100)
        `);

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

        // Add new columns to existing guilds table if they don't exist
        await client.query(`
            ALTER TABLE guilds 
            ADD COLUMN IF NOT EXISTS added_by_user_id VARCHAR(20),
            ADD COLUMN IF NOT EXISTS added_by_username VARCHAR(100)
        `);

        // Add foreign key reference to server_admins (optional, for data integrity)
        await client.query(`
            ALTER TABLE channel_webhooks 
            ADD COLUMN IF NOT EXISTS registered_by_admin_id VARCHAR(20)
        `);
        
        await client.query(`
            ALTER TABLE guilds 
            ADD COLUMN IF NOT EXISTS added_by_admin_id VARCHAR(20)
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
    setChannelWebhook: async (channelId, webhookUrl, guildId, userId = null, username = null) => {
        try {
            console.log(`🔗 [WEBHOOK_SETUP] Setting webhook for channel ${channelId}`);
            console.log(`🔗 [WEBHOOK_SETUP] User: ${username} (${userId})`);
            console.log(`🔗 [WEBHOOK_SETUP] Guild: ${guildId}`);
            console.log(`🔗 [WEBHOOK_SETUP] Webhook URL: ${webhookUrl}`);
            
            // Track the admin first
            if (userId && username) {
                await db.trackServerAdmin(userId, username);
            }
            
            const result = await pool.query(`
                INSERT INTO channel_webhooks (channel_id, webhook_url, guild_id, registered_by_user_id, registered_by_username, registered_by_admin_id)
                VALUES ($1, $2, $3, $4, $5, $4)
                ON CONFLICT (channel_id) 
                DO UPDATE SET 
                    webhook_url = EXCLUDED.webhook_url,
                    guild_id = EXCLUDED.guild_id,
                    registered_by_user_id = EXCLUDED.registered_by_user_id,
                    registered_by_username = EXCLUDED.registered_by_username,
                    registered_by_admin_id = EXCLUDED.registered_by_admin_id,
                    is_active = true,
                    failure_count = 0,
                    disabled_reason = NULL,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [channelId, webhookUrl, guildId, userId, username]);
            
            console.log(`✅ [WEBHOOK_SETUP] Webhook stored successfully for channel ${channelId}`);
            return result.rows[0];
        } catch (error) {
            console.error('❌ [WEBHOOK_SETUP] Error setting channel webhook:', error);
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
            console.log(`🏰 [GUILD_SETUP] Storing guild: ${guildName} (${guildId})`);
            console.log(`🏰 [GUILD_SETUP] Added by: ${username} (${userId})`);
            
            // Track the admin first
            if (userId && username) {
                await db.trackServerAdmin(userId, username);
            }
            
            await pool.query(`
                INSERT INTO guilds (id, name, added_by_user_id, added_by_username, added_by_admin_id)
                VALUES ($1, $2, $3, $4, $3)
                ON CONFLICT (id) 
                DO UPDATE SET 
                    name = EXCLUDED.name,
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId, guildName, userId, username]);
            
            console.log(`✅ [GUILD_SETUP] Guild stored successfully: ${guildName}`);
        } catch (error) {
            console.error('❌ [GUILD_SETUP] Error storing guild:', error);
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
            
            // If immediate disable (404, 403, 410 errors), disable right away
            if (immediateDisable) {
                await pool.query(`
                    UPDATE channel_webhooks 
                    SET 
                        failure_count = failure_count + 1,
                        last_failure_at = CURRENT_TIMESTAMP,
                        is_active = false,
                        disabled_reason = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE channel_id = $1
                `, [channelId, `Auto-disabled due to permanent error: ${errorMessage}`]);
                
                console.warn(`🚫 Webhook immediately disabled due to permanent error: ${errorMessage}`);
                return { disabled: true, immediate: true };
            }
            
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
                
                console.log(`⚠️ Temporary error (not counted): ${errorMessage}`);
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
                
                console.warn(`🚫 Webhook auto-disabled after ${MAX_FAILURES} consecutive failures`);
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

    // Check if user info exists for a webhook, update if missing (backwards compatibility)
    updateWebhookUserInfo: async (channelId, userId, username) => {
        try {
            console.log(`🔄 [BACKWARDS_COMPAT] Checking webhook user info for channel ${channelId}`);
            console.log(`🔄 [BACKWARDS_COMPAT] Updating with user: ${username} (${userId})`);
            
            // Track the admin first
            if (userId && username) {
                await db.trackServerAdmin(userId, username);
            }
            
            const result = await pool.query(`
                UPDATE channel_webhooks 
                SET 
                    registered_by_user_id = $2,
                    registered_by_username = $3,
                    registered_by_admin_id = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE channel_id = $1 AND registered_by_user_id IS NULL
                RETURNING *
            `, [channelId, userId, username]);
            
            if (result.rows[0]) {
                console.log(`✅ [BACKWARDS_COMPAT] Updated webhook user info for channel ${channelId}`);
            } else {
                console.log(`ℹ️ [BACKWARDS_COMPAT] No update needed for channel ${channelId} (already has user info)`);
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('❌ [BACKWARDS_COMPAT] Error updating webhook user info:', error);
            return null;
        }
    },

    // Check if guild has user info, update if missing (backwards compatibility)
    updateGuildUserInfo: async (guildId, userId, username) => {
        try {
            console.log(`🔄 [BACKWARDS_COMPAT] Checking guild user info for guild ${guildId}`);
            console.log(`🔄 [BACKWARDS_COMPAT] Updating with user: ${username} (${userId})`);
            
            // Track the admin first
            if (userId && username) {
                await db.trackServerAdmin(userId, username);
            }
            
            const result = await pool.query(`
                UPDATE guilds 
                SET 
                    added_by_user_id = $2,
                    added_by_username = $3,
                    added_by_admin_id = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND added_by_user_id IS NULL
                RETURNING *
            `, [guildId, userId, username]);
            
            if (result.rows[0]) {
                console.log(`✅ [BACKWARDS_COMPAT] Updated guild user info for guild ${guildId}`);
            } else {
                console.log(`ℹ️ [BACKWARDS_COMPAT] No update needed for guild ${guildId} (already has user info)`);
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('❌ [BACKWARDS_COMPAT] Error updating guild user info:', error);
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

    // Track server admin (upsert operation)
    trackServerAdmin: async (userId, username, displayName = null) => {
        try {
            console.log(`🔍 [USER_TRACKING] Tracking admin: ${username} (${userId})`);
            
            const result = await pool.query(`
                INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    username = EXCLUDED.username,
                    display_name = EXCLUDED.display_name,
                    last_seen = CURRENT_TIMESTAMP,
                    interaction_count = server_admins.interaction_count + 1
                RETURNING *
            `, [userId, username, displayName]);
            
            const admin = result.rows[0];
            const isNew = admin.interaction_count === 1;
            
            console.log(`✅ [USER_TRACKING] ${isNew ? 'New' : 'Existing'} admin tracked: ${username} (interactions: ${admin.interaction_count})`);
            
            return { admin, isNew };
        } catch (error) {
            console.error('❌ [USER_TRACKING] Error tracking server admin:', error);
            return { admin: null, isNew: false };
        }
    },

    // Get admin details
    getServerAdmin: async (userId) => {
        try {
            const result = await pool.query(
                'SELECT * FROM server_admins WHERE user_id = $1',
                [userId]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting server admin:', error);
            return null;
        }
    },

    // Get all tracked admins
    getAllAdmins: async () => {
        try {
            const result = await pool.query(
                'SELECT * FROM server_admins ORDER BY last_seen DESC'
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting all admins:', error);
            return [];
        }
    },

};

module.exports = { pool, initDatabase, db }; 