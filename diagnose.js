const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:LShTlpjVuOusixsrBCNXctWMBkpNpAEN@mainline.proxy.rlwy.net:26819/railway',
    ssl: { rejectUnauthorized: false }
});

async function diagnose() {
    try {
        const channelId = '1364799838054649856';

        console.log('='.repeat(60));
        console.log('DIAGNOSTIC REPORT FOR DISCORD WEBHOOK ISSUE');
        console.log('='.repeat(60));
        console.log('');

        // Check webhook configuration
        console.log('1️⃣ CHECKING WEBHOOK CONFIGURATION');
        console.log('-'.repeat(60));
        const webhookResult = await pool.query(
            'SELECT * FROM channel_webhooks WHERE channel_id = $1',
            [channelId]
        );

        if (webhookResult.rows[0]) {
            const wh = webhookResult.rows[0];
            console.log('✅ Webhook exists in database');
            console.log(`   URL: ${wh.webhook_url}`);
            console.log(`   Active: ${wh.is_active}`);
            console.log(`   Failure Count: ${wh.failure_count}`);
            console.log(`   Send Bot Messages: ${wh.send_bot_messages}`);
            console.log(`   Last Updated: ${wh.updated_at}`);

            if (!wh.is_active) {
                console.log('   ❌ ISSUE: Webhook is disabled!');
                console.log(`   Reason: ${wh.disabled_reason}`);
            }
        } else {
            console.log('❌ No webhook found in database');
        }
        console.log('');

        // Check all webhooks in the guild
        console.log('2️⃣ CHECKING ALL WEBHOOKS IN GUILD');
        console.log('-'.repeat(60));
        const guildId = '1363068664886329397'; // from your Discord URL
        const allWebhooks = await pool.query(
            'SELECT channel_id, webhook_url, is_active, failure_count FROM channel_webhooks WHERE guild_id = $1',
            [guildId]
        );

        console.log(`Found ${allWebhooks.rows.length} webhook(s) in your server:`);
        allWebhooks.rows.forEach((wh, i) => {
            console.log(`   ${i + 1}. Channel: ${wh.channel_id}`);
            console.log(`      Active: ${wh.is_active}, Failures: ${wh.failure_count}`);
        });
        console.log('');

        // Check database schema
        console.log('3️⃣ CHECKING DATABASE SCHEMA');
        console.log('-'.repeat(60));
        const schemaResult = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'channel_webhooks'
            ORDER BY ordinal_position
        `);

        console.log('Database columns:');
        schemaResult.rows.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type})`);
        });
        console.log('');

        // Test the webhook URL
        console.log('4️⃣ TESTING WEBHOOK URL');
        console.log('-'.repeat(60));
        const axios = require('axios');
        const webhookUrl = 'https://n8n.emp0.com/webhook/discord-emp0-business-model-validator';

        try {
            const testResponse = await axios.post(webhookUrl, {
                event_type: 'diagnostic_test',
                message: 'Testing webhook from diagnostic script',
                timestamp: Date.now()
            }, { timeout: 5000 });

            console.log('✅ Webhook is reachable');
            console.log(`   Status: ${testResponse.status}`);
            console.log(`   Response: ${JSON.stringify(testResponse.data)}`);
        } catch (error) {
            console.log('❌ Webhook test failed');
            console.log(`   Error: ${error.message}`);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
            }
        }
        console.log('');

        // Summary
        console.log('5️⃣ DIAGNOSIS SUMMARY');
        console.log('-'.repeat(60));

        const wh = webhookResult.rows[0];
        if (!wh) {
            console.log('❌ PROBLEM: No webhook configured for this channel');
            console.log('   Solution: Run /setup command in Discord');
        } else if (!wh.is_active) {
            console.log('❌ PROBLEM: Webhook is disabled');
            console.log('   Solution: Run /setup command again to re-enable');
        } else if (wh.failure_count > 0) {
            console.log('⚠️  WARNING: Webhook has failures but is still active');
            console.log(`   Failure count: ${wh.failure_count}/5`);
        } else {
            console.log('✅ Configuration looks correct!');
            console.log('');
            console.log('If messages still aren\'t working, check:');
            console.log('   1. Is the bot actually running? (Check Railway logs)');
            console.log('   2. Does the bot have proper Discord permissions?');
            console.log('   3. Is the MESSAGE CONTENT intent enabled?');
            console.log('   4. Are you testing with bot messages? (disabled by default)');
        }
        console.log('');
        console.log('='.repeat(60));

        await pool.end();
    } catch (error) {
        console.error('Error during diagnosis:', error);
        await pool.end();
    }
}

diagnose();
