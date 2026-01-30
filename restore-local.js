#!/usr/bin/env node
/**
 * Restore database from local CSV files in /app/data/
 *
 * Usage:
 *   docker-compose exec discord-bot node restore-local.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, initDatabase } = require('./database');

const DATA_DIR = path.join(__dirname, 'data');

function parseCSV(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += c;
        }
    }
    values.push(current);
    return values;
}

function parseDate(d) {
    if (!d || d === 'null' || d === '' || d === 'undefined') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d;
    try {
        const p = new Date(d);
        if (!isNaN(p.getTime())) return p.toISOString();
    } catch (e) {}
    return null;
}

async function run() {
    console.log('');
    console.log('='.repeat(50));
    console.log('RESTORE FROM LOCAL FILES');
    console.log('='.repeat(50));
    console.log(`Data directory: ${DATA_DIR}`);
    console.log('');

    // Check files exist
    const webhooksFile = path.join(DATA_DIR, 'channel_webhooks.csv');
    const guildsFile = path.join(DATA_DIR, 'guilds.csv');
    const adminsFile = path.join(DATA_DIR, 'server_admins.csv');

    if (!fs.existsSync(webhooksFile)) {
        console.error('ERROR: channel_webhooks.csv not found');
        process.exit(1);
    }
    if (!fs.existsSync(guildsFile)) {
        console.error('ERROR: guilds.csv not found');
        process.exit(1);
    }

    await initDatabase();
    const client = await pool.connect();

    try {
        // Truncate all tables
        console.log('Truncating tables...');
        await client.query('TRUNCATE TABLE channel_webhooks, guilds, server_admins RESTART IDENTITY CASCADE');
        console.log('Tables cleared.\n');

        // Restore server_admins
        if (fs.existsSync(adminsFile)) {
            console.log('Restoring server_admins...');
            const adminsData = fs.readFileSync(adminsFile, 'utf8');
            const adminsLines = adminsData.split('\n').filter(l => l.trim());
            if (adminsLines.length > 1) {
                const headers = parseCSV(adminsLines[0]);
                let count = 0;
                for (let i = 1; i < adminsLines.length; i++) {
                    const vals = parseCSV(adminsLines[i]);
                    const r = {};
                    headers.forEach((h, idx) => r[h] = vals[idx] || null);
                    if (r.user_id) {
                        await client.query(
                            'INSERT INTO server_admins (user_id, username, display_name, first_seen, last_seen, interaction_count) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
                            [
                                r.user_id,
                                r.username || 'unknown',
                                r.display_name || null,
                                parseDate(r.first_seen) || new Date().toISOString(),
                                parseDate(r.last_seen) || new Date().toISOString(),
                                parseInt(r.interaction_count) || 1
                            ]
                        );
                        count++;
                    }
                }
                console.log(`  Restored ${count} admin records`);
            }
        } else {
            console.log('server_admins.csv not found, skipping...');
        }

        // Restore guilds
        console.log('Restoring guilds...');
        const guildsData = fs.readFileSync(guildsFile, 'utf8');
        const guildsLines = guildsData.split('\n').filter(l => l.trim());
        if (guildsLines.length > 1) {
            const headers = parseCSV(guildsLines[0]);
            let count = 0;
            for (let i = 1; i < guildsLines.length; i++) {
                const vals = parseCSV(guildsLines[i]);
                const r = {};
                headers.forEach((h, idx) => r[h] = vals[idx] || null);
                if (r.id && r.name) {
                    await client.query(
                        'INSERT INTO guilds (id, name, added_by_admin_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
                        [
                            r.id,
                            r.name,
                            r.added_by_admin_id || null,
                            parseDate(r.created_at) || new Date().toISOString(),
                            parseDate(r.updated_at) || new Date().toISOString()
                        ]
                    );
                    count++;
                }
            }
            console.log(`  Restored ${count} guild records`);
        }

        // Restore channel_webhooks
        console.log('Restoring channel_webhooks...');
        const webhooksData = fs.readFileSync(webhooksFile, 'utf8');
        const webhooksLines = webhooksData.split('\n').filter(l => l.trim());
        if (webhooksLines.length > 1) {
            const headers = parseCSV(webhooksLines[0]);
            let count = 0;
            for (let i = 1; i < webhooksLines.length; i++) {
                const vals = parseCSV(webhooksLines[i]);
                const r = {};
                headers.forEach((h, idx) => r[h] = vals[idx] || null);
                if (r.channel_id && r.webhook_url && r.guild_id) {
                    await client.query(
                        'INSERT INTO channel_webhooks (channel_id, webhook_url, guild_id, failure_count, last_failure_at, is_active, disabled_reason, registered_by_admin_id, send_bot_messages, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING',
                        [
                            r.channel_id,
                            r.webhook_url,
                            r.guild_id,
                            parseInt(r.failure_count) || 0,
                            parseDate(r.last_failure_at),
                            r.is_active !== 'false',
                            r.disabled_reason || null,
                            r.registered_by_admin_id || null,
                            r.send_bot_messages === 'true',
                            parseDate(r.created_at) || new Date().toISOString(),
                            parseDate(r.updated_at) || new Date().toISOString()
                        ]
                    );
                    count++;
                }
            }
            console.log(`  Restored ${count} webhook records`);
        }

        // Verify
        console.log('');
        console.log('='.repeat(50));
        console.log('VERIFICATION');
        console.log('='.repeat(50));
        const verify = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM channel_webhooks) as webhooks,
                (SELECT COUNT(*) FROM guilds) as guilds,
                (SELECT COUNT(*) FROM server_admins) as admins
        `);
        console.log(`Webhooks: ${verify.rows[0].webhooks}`);
        console.log(`Guilds:   ${verify.rows[0].guilds}`);
        console.log(`Admins:   ${verify.rows[0].admins}`);
        console.log('');
        console.log('='.repeat(50));
        console.log('RESTORE COMPLETE');
        console.log('='.repeat(50));
        console.log('');

    } finally {
        client.release();
    }

    process.exit(0);
}

run().catch(e => {
    console.error('Restore failed:', e);
    process.exit(1);
});
