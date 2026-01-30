#!/usr/bin/env node
/**
 * Force restore from GitHub backup
 *
 * Usage:
 *   node force-restore.js                    # Restore from latest backup
 *   node force-restore.js <backup-name>      # Restore specific backup
 *
 * In Docker:
 *   docker-compose exec discord-bot node force-restore.js
 */

require('dotenv').config();
const axios = require('axios');
const { pool, initDatabase } = require('./database');

const githubToken = process.env.GITHUB_TOKEN;
const githubRepo = process.env.GITHUB_REPO;
const commitRef = process.env.BACKUP_COMMIT_REF || 'main';

if (!githubToken || !githubRepo) {
    console.error('ERROR: GITHUB_TOKEN and GITHUB_REPO must be set');
    process.exit(1);
}

const headers = {
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'n8n-discord-bot'
};

/**
 * Parse various date formats to ISO string for PostgreSQL
 */
function parseDate(dateStr) {
    if (!dateStr || dateStr === 'null' || dateStr === '' || dateStr === 'undefined') {
        return null;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr;
    }
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    } catch (e) {}
    return null;
}

/**
 * Parse CSV line handling quoted values
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
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
 * Download file from GitHub
 */
async function downloadFile(filePath) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${githubRepo}/contents/${filePath}?ref=${commitRef}`,
            { headers }
        );
        return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
        if (error.response?.status === 404) return null;
        throw error;
    }
}

/**
 * List all backups from GitHub
 */
async function listBackups() {
    console.log(`Fetching backups from: ${githubRepo} (ref: ${commitRef})`);

    let allBackups = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const response = await axios.get(
            `https://api.github.com/repos/${githubRepo}/contents/data?ref=${commitRef}&per_page=100&page=${page}`,
            { headers }
        );

        const backups = response.data
            .filter(item => item.type === 'dir' && item.name.startsWith('backup-'))
            .map(item => item.name);

        allBackups = allBackups.concat(backups);
        hasMore = response.data.length === 100;
        page++;
    }

    // Sort by date (newest first)
    allBackups.sort((a, b) => {
        const parseBackupDate = (name) => {
            const match = name.replace('backup-', '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
            if (match) {
                return new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
            }
            return new Date(0);
        };
        return parseBackupDate(b) - parseBackupDate(a);
    });

    return allBackups;
}

/**
 * Restore from a specific backup
 */
async function restore(backupName) {
    console.log(`\n=== FORCE RESTORE: ${backupName} ===\n`);

    // Download metadata first
    const metadata = await downloadFile(`data/${backupName}/metadata.json`);
    if (metadata) {
        const meta = JSON.parse(metadata);
        console.log('Backup info:');
        console.log(`  - Timestamp: ${meta.timestamp}`);
        console.log(`  - Webhooks: ${meta.webhookCount}`);
        console.log(`  - Guilds: ${meta.guildCount}`);
        console.log(`  - Admins: ${meta.adminCount || 'N/A'}`);
        console.log('');
    }

    const client = await pool.connect();

    try {
        // TRUNCATE all tables first (faster than DELETE)
        console.log('Clearing existing data...');
        await client.query('TRUNCATE TABLE channel_webhooks, guilds, server_admins RESTART IDENTITY CASCADE');
        console.log('Tables cleared.\n');

        // Restore server_admins
        console.log('Restoring server_admins...');
        const adminsCSV = await downloadFile(`data/${backupName}/server_admins.csv`);
        if (adminsCSV) {
            const lines = adminsCSV.split('\n').filter(l => l.trim());
            if (lines.length > 1) {
                const headers = parseCSVLine(lines[0]);
                let count = 0;
                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    const record = {};
                    headers.forEach((h, idx) => record[h] = values[idx] || null);

                    if (record.user_id) {
                        await client.query(`
                            INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (user_id) DO NOTHING
                        `, [
                            record.user_id,
                            record.username || 'unknown',
                            record.display_name || null,
                            parseDate(record.first_seen) || new Date().toISOString(),
                            parseDate(record.last_seen) || new Date().toISOString(),
                            parseInt(record.interaction_count) || 1
                        ]);
                        count++;
                    }
                }
                console.log(`  Restored ${count} admin records`);
            }
        }

        // Restore guilds
        console.log('Restoring guilds...');
        const guildsCSV = await downloadFile(`data/${backupName}/guilds.csv`);
        if (guildsCSV) {
            const lines = guildsCSV.split('\n').filter(l => l.trim());
            if (lines.length > 1) {
                const headers = parseCSVLine(lines[0]);
                let count = 0;
                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    const record = {};
                    headers.forEach((h, idx) => record[h] = values[idx] || null);

                    if (record.id && record.name) {
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
                        count++;
                    }
                }
                console.log(`  Restored ${count} guild records`);
            }
        }

        // Restore channel_webhooks
        console.log('Restoring channel_webhooks...');
        const webhooksCSV = await downloadFile(`data/${backupName}/channel_webhooks.csv`);
        if (webhooksCSV) {
            const lines = webhooksCSV.split('\n').filter(l => l.trim());
            if (lines.length > 1) {
                const headers = parseCSVLine(lines[0]);
                let count = 0;
                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    const record = {};
                    headers.forEach((h, idx) => record[h] = values[idx] || null);

                    if (record.channel_id && record.webhook_url && record.guild_id) {
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
                        count++;
                    }
                }
                console.log(`  Restored ${count} webhook records`);
            }
        }

        // Verify
        console.log('\n=== VERIFICATION ===');
        const webhookCount = await client.query('SELECT COUNT(*) FROM channel_webhooks');
        const guildCount = await client.query('SELECT COUNT(*) FROM guilds');
        const adminCount = await client.query('SELECT COUNT(*) FROM server_admins');
        console.log(`Webhooks: ${webhookCount.rows[0].count}`);
        console.log(`Guilds: ${guildCount.rows[0].count}`);
        console.log(`Admins: ${adminCount.rows[0].count}`);
        console.log('\n=== RESTORE COMPLETE ===\n');

    } finally {
        client.release();
    }
}

async function main() {
    const specificBackup = process.argv[2];

    try {
        await initDatabase();

        if (specificBackup) {
            await restore(specificBackup);
        } else {
            // Find and use latest backup
            const backups = await listBackups();
            console.log(`Found ${backups.length} backups`);
            console.log('Latest 5:');
            backups.slice(0, 5).forEach((b, i) => console.log(`  ${i + 1}. ${b}`));

            if (backups.length === 0) {
                console.error('No backups found!');
                process.exit(1);
            }

            await restore(backups[0]);
        }

        process.exit(0);
    } catch (error) {
        console.error('Restore failed:', error);
        process.exit(1);
    }
}

main();
