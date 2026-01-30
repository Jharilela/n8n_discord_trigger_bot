/**
 * Docker initialization script
 *
 * On first run with empty database:
 * 1. Fetches the latest backup from GitHub
 * 2. Restores all tables from the backup
 * 3. Then starts the main application
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pool, initDatabase } = require('./database');

const dataDir = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Check if the database has any data
 */
async function isDatabaseEmpty() {
    try {
        const client = await pool.connect();

        // Check if tables exist and have data
        const webhookCount = await client.query('SELECT COUNT(*) FROM channel_webhooks');
        const guildCount = await client.query('SELECT COUNT(*) FROM guilds');

        client.release();

        const totalRecords = parseInt(webhookCount.rows[0].count) + parseInt(guildCount.rows[0].count);
        console.log(`Database check: ${webhookCount.rows[0].count} webhooks, ${guildCount.rows[0].count} guilds`);

        return totalRecords === 0;
    } catch (error) {
        // Tables might not exist yet
        console.log('Database appears to be new (tables may not exist yet)');
        return true;
    }
}

/**
 * List backup directories in GitHub repo
 */
async function listGitHubBackups() {
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;

    if (!githubToken || !githubRepo) {
        console.log('GitHub credentials not configured, skipping backup restore');
        return [];
    }

    try {
        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'n8n-discord-bot'
        };

        // List contents of data directory
        const response = await axios.get(
            `https://api.github.com/repos/${githubRepo}/contents/data`,
            { headers }
        );

        // Filter for backup directories and sort by name (newest first)
        const backups = response.data
            .filter(item => item.type === 'dir' && item.name.startsWith('backup-'))
            .map(item => item.name)
            .sort()
            .reverse();

        return backups;
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('No backups found in GitHub repository');
        } else {
            console.error('Error listing GitHub backups:', error.response?.data || error.message);
        }
        return [];
    }
}

/**
 * Download a file from GitHub
 */
async function downloadFromGitHub(filePath) {
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;

    const headers = {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'n8n-discord-bot'
    };

    try {
        const response = await axios.get(
            `https://api.github.com/repos/${githubRepo}/contents/${filePath}`,
            { headers }
        );

        // Decode base64 content
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return content;
    } catch (error) {
        if (error.response?.status === 404) {
            return null;
        }
        throw error;
    }
}

/**
 * Fetch latest backup from GitHub and save locally
 */
async function fetchLatestBackupFromGitHub() {
    console.log('Fetching latest backup from GitHub...');

    const backups = await listGitHubBackups();

    if (backups.length === 0) {
        console.log('No backups available in GitHub');
        return null;
    }

    const latestBackup = backups[0];
    console.log(`Found latest backup: ${latestBackup}`);

    const localBackupDir = path.join(dataDir, latestBackup);
    if (!fs.existsSync(localBackupDir)) {
        fs.mkdirSync(localBackupDir, { recursive: true });
    }

    // Download all backup files
    const files = ['channel_webhooks.csv', 'guilds.csv', 'server_admins.csv', 'metadata.json'];

    for (const file of files) {
        const content = await downloadFromGitHub(`data/${latestBackup}/${file}`);
        if (content) {
            fs.writeFileSync(path.join(localBackupDir, file), content);
            console.log(`Downloaded: ${file}`);
        }
    }

    return localBackupDir;
}

/**
 * Parse CSV content handling quoted values properly
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);

    return values;
}

/**
 * Parse various date formats to ISO string for PostgreSQL
 */
function parseDate(dateStr) {
    if (!dateStr || dateStr === 'null' || dateStr === '') {
        return null;
    }

    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr;
    }

    // Try parsing as JavaScript Date string (e.g., "Tue Aug 05 2025 07:42:23 GMT+0000")
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    } catch (e) {
        // Fall through
    }

    // Return null for unparseable dates
    console.log(`Warning: Could not parse date: ${dateStr}`);
    return null;
}

/**
 * Restore database from local backup directory
 */
async function restoreFromBackup(backupDir) {
    console.log(`Restoring database from: ${backupDir}`);

    const client = await pool.connect();

    try {
        // Restore server_admins first (referenced by other tables)
        const adminsFile = path.join(backupDir, 'server_admins.csv');
        if (fs.existsSync(adminsFile)) {
            const content = fs.readFileSync(adminsFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            if (lines.length > 1) {
                const headers = parseCSVLine(lines[0]);

                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    if (values.length >= 2) {
                        // Map values to columns
                        const record = {};
                        headers.forEach((h, idx) => record[h] = values[idx] || null);

                        await client.query(`
                            INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (user_id) DO NOTHING
                        `, [
                            record.user_id,
                            record.username,
                            record.display_name || null,
                            parseDate(record.first_seen) || new Date().toISOString(),
                            parseDate(record.last_seen) || new Date().toISOString(),
                            parseInt(record.interaction_count) || 1
                        ]);
                    }
                }
                console.log(`Restored ${lines.length - 1} admin records`);
            }
        }

        // Restore guilds
        const guildsFile = path.join(backupDir, 'guilds.csv');
        if (fs.existsSync(guildsFile)) {
            const content = fs.readFileSync(guildsFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            if (lines.length > 1) {
                const headers = parseCSVLine(lines[0]);

                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    if (values.length >= 2) {
                        const record = {};
                        headers.forEach((h, idx) => record[h] = values[idx] || null);

                        await client.query(`
                            INSERT INTO guilds (id, name, added_by_admin_id, created_at, updated_at)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (id) DO NOTHING
                        `, [
                            record.id,
                            record.name,
                            record.added_by_admin_id || null,
                            parseDate(record.created_at) || new Date().toISOString(),
                            parseDate(record.updated_at) || new Date().toISOString()
                        ]);
                    }
                }
                console.log(`Restored ${lines.length - 1} guild records`);
            }
        }

        // Restore channel_webhooks
        const webhooksFile = path.join(backupDir, 'channel_webhooks.csv');
        if (fs.existsSync(webhooksFile)) {
            const content = fs.readFileSync(webhooksFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            if (lines.length > 1) {
                const headers = parseCSVLine(lines[0]);

                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    if (values.length >= 3) {
                        const record = {};
                        headers.forEach((h, idx) => record[h] = values[idx] || null);

                        await client.query(`
                            INSERT INTO channel_webhooks (
                                channel_id, webhook_url, guild_id, failure_count,
                                last_failure_at, is_active, disabled_reason,
                                registered_by_admin_id, send_bot_messages,
                                created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                            ON CONFLICT (channel_id) DO NOTHING
                        `, [
                            record.channel_id,
                            record.webhook_url,
                            record.guild_id,
                            parseInt(record.failure_count) || 0,
                            parseDate(record.last_failure_at),
                            record.is_active !== 'false',
                            record.disabled_reason || null,
                            record.registered_by_admin_id || null,
                            record.send_bot_messages === 'true',
                            parseDate(record.created_at) || new Date().toISOString(),
                            parseDate(record.updated_at) || new Date().toISOString()
                        ]);
                    }
                }
                console.log(`Restored ${lines.length - 1} webhook records`);
            }
        }

        console.log('Database restore completed successfully');

    } finally {
        client.release();
    }
}

/**
 * Main initialization function
 */
async function init() {
    console.log('='.repeat(50));
    console.log('Docker initialization starting...');
    console.log('='.repeat(50));

    try {
        // Initialize database tables first
        await initDatabase();

        // Check if database is empty
        const isEmpty = await isDatabaseEmpty();

        if (isEmpty) {
            console.log('Database is empty, attempting to restore from GitHub backup...');

            const backupDir = await fetchLatestBackupFromGitHub();

            if (backupDir) {
                await restoreFromBackup(backupDir);
                console.log('Backup restored successfully!');
            } else {
                console.log('No backup to restore, starting with empty database');
            }
        } else {
            console.log('Database already has data, skipping restore');
        }

        console.log('='.repeat(50));
        console.log('Initialization complete, starting bot...');
        console.log('='.repeat(50));

        // Start the main application
        require('./start');

    } catch (error) {
        console.error('Initialization failed:', error);
        process.exit(1);
    }
}

// Run initialization
init();
