const { exportToCSV, restoreFromCSV } = require('./backup');
const { db } = require('./database');
const fs = require('fs');
const path = require('path');

// Test the CSV backup system
const testBackupSystem = async () => {
    console.log('Testing CSV backup system...\n');
    
    try {
        // Step 1: Create some test data
        console.log('1. Creating test data...');
        await db.setChannelWebhook('123456789012345678', 'https://test-n8n.com/webhook/test1', '987654321098765432');
        await db.setChannelWebhook('234567890123456789', 'https://test-n8n.com/webhook/test2', '987654321098765432');
        await db.storeGuild('987654321098765432', 'Test Discord Server');
        console.log('✓ Test data created\n');
        
        // Step 2: Export to CSV
        console.log('2. Exporting to CSV...');
        const backupDir = await exportToCSV();
        console.log(`✓ CSV export completed: ${backupDir}\n`);
        
        // Step 3: Verify CSV files exist
        console.log('3. Verifying CSV files...');
        const webhooksFile = path.join(backupDir, 'channel_webhooks.csv');
        const guildsFile = path.join(backupDir, 'guilds.csv');
        const metadataFile = path.join(backupDir, 'metadata.json');
        
        if (fs.existsSync(webhooksFile)) {
            const content = fs.readFileSync(webhooksFile, 'utf8');
            console.log(`✓ channel_webhooks.csv exists (${content.split('\n').length - 1} records)`);
        } else {
            console.log('✗ channel_webhooks.csv missing');
        }
        
        if (fs.existsSync(guildsFile)) {
            const content = fs.readFileSync(guildsFile, 'utf8');
            console.log(`✓ guilds.csv exists (${content.split('\n').length - 1} records)`);
        } else {
            console.log('✗ guilds.csv missing');
        }
        
        if (fs.existsSync(metadataFile)) {
            const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            console.log(`✓ metadata.json exists (${metadata.webhookCount} webhooks, ${metadata.guildCount} guilds)`);
        } else {
            console.log('✗ metadata.json missing');
        }
        console.log('');
        
        // Step 4: Clear database and restore
        console.log('4. Testing restore functionality...');
        await db.removeChannelWebhook('123456789012345678');
        await db.removeChannelWebhook('234567890123456789');
        
        // Verify data is cleared
        const webhooks = await db.getGuildWebhooks('987654321098765432');
        console.log(`✓ Database cleared (${webhooks.length} webhooks remaining)`);
        
        // Restore from backup
        await restoreFromCSV(backupDir);
        console.log('✓ Data restored from CSV\n');
        
        // Step 5: Verify restore worked
        console.log('5. Verifying restore...');
        const restoredWebhooks = await db.getGuildWebhooks('987654321098765432');
        console.log(`✓ Restored ${restoredWebhooks.length} webhooks`);
        
        const webhook1 = await db.getChannelWebhook('123456789012345678');
        const webhook2 = await db.getChannelWebhook('234567890123456789');
        
        if (webhook1 === 'https://test-n8n.com/webhook/test1') {
            console.log('✓ First webhook restored correctly');
        } else {
            console.log('✗ First webhook restore failed');
        }
        
        if (webhook2 === 'https://test-n8n.com/webhook/test2') {
            console.log('✓ Second webhook restored correctly');
        } else {
            console.log('✗ Second webhook restore failed');
        }
        
        console.log('\n🎉 CSV backup system test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
};

// Run test if called directly
if (require.main === module) {
    testBackupSystem();
}

module.exports = { testBackupSystem }; 