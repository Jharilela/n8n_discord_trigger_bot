const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:LShTlpjVuOusixsrBCNXctWMBkpNpAEN@mainline.proxy.rlwy.net:26819/railway',
    ssl: { rejectUnauthorized: false }
});

async function checkWebhook() {
    try {
        const channelId = '1364799838054649856';

        console.log('Checking webhook status for channel:', channelId);
        console.log('');

        const result = await pool.query(
            'SELECT * FROM channel_webhooks WHERE channel_id = $1',
            [channelId]
        );

        if (result.rows[0]) {
            const webhook = result.rows[0];
            console.log('📊 WEBHOOK FOUND:');
            console.log('================');
            console.log('Channel ID:', webhook.channel_id);
            console.log('Webhook URL:', webhook.webhook_url);
            console.log('Is Active:', webhook.is_active);
            console.log('Failure Count:', webhook.failure_count);
            console.log('Disabled Reason:', webhook.disabled_reason || 'none');
            console.log('Last Failure:', webhook.last_failure_at || 'never');
            console.log('Send Bot Messages:', webhook.send_bot_messages);
            console.log('Created At:', webhook.created_at);
            console.log('Updated At:', webhook.updated_at);
            console.log('');

            if (!webhook.is_active) {
                console.log('🚫 PROBLEM FOUND: Webhook is DISABLED!');
                console.log('This is why messages are not being sent.');
                console.log('');
                console.log('Reason:', webhook.disabled_reason);
            } else {
                console.log('✅ Webhook is ACTIVE');
                console.log('Messages should be forwarding...');
            }
        } else {
            console.log('❌ NO WEBHOOK FOUND for this channel');
        }

        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        await pool.end();
    }
}

checkWebhook();
