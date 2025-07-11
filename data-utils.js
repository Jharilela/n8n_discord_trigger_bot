const fs = require('fs');
const path = require('path');
const { exportToCSV, restoreFromCSV } = require('./backup');

// Utility functions for manual backup and restore operations
const dataUtils = {
    // List all available backups
    listBackups: () => {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            console.log('No data directory found');
            return [];
        }
        
        const files = fs.readdirSync(dataDir);
        const backupDirs = files.filter(file => 
            file.startsWith('backup-') && 
            fs.statSync(path.join(dataDir, file)).isDirectory()
        );
        
        backupDirs.sort().reverse(); // Most recent first
        
        console.log('Available backups:');
        backupDirs.forEach((dir, index) => {
            const metadataFile = path.join(dataDir, dir, 'metadata.json');
            if (fs.existsSync(metadataFile)) {
                const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
                console.log(`${index + 1}. ${dir} (${metadata.webhookCount} webhooks, ${metadata.guildCount} guilds) - ${metadata.timestamp}`);
            } else {
                console.log(`${index + 1}. ${dir}`);
            }
        });
        
        return backupDirs;
    },
    
    // Create a manual backup
    createBackup: async () => {
        try {
            console.log('Creating manual backup...');
            const backupDir = await exportToCSV();
            console.log(`Backup created: ${backupDir}`);
            return backupDir;
        } catch (error) {
            console.error('Failed to create backup:', error);
            throw error;
        }
    },
    
    // Restore from a specific backup
    restoreBackup: async (backupName) => {
        try {
            const dataDir = path.join(__dirname, 'data');
            const backupDir = path.join(dataDir, backupName);
            
            if (!fs.existsSync(backupDir)) {
                throw new Error(`Backup directory not found: ${backupName}`);
            }
            
            console.log(`Restoring from backup: ${backupName}`);
            await restoreFromCSV(backupDir);
            console.log('Restore completed successfully');
        } catch (error) {
            console.error('Failed to restore backup:', error);
            throw error;
        }
    },
    
    // Get latest backup
    getLatestBackup: () => {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            return null;
        }
        
        const files = fs.readdirSync(dataDir);
        const backupDirs = files.filter(file => 
            file.startsWith('backup-') && 
            fs.statSync(path.join(dataDir, file)).isDirectory()
        );
        
        if (backupDirs.length === 0) {
            return null;
        }
        
        backupDirs.sort().reverse();
        return backupDirs[0];
    },
    
    // Show backup details
    showBackupDetails: (backupName) => {
        const dataDir = path.join(__dirname, 'data');
        const backupDir = path.join(dataDir, backupName);
        
        if (!fs.existsSync(backupDir)) {
            console.log(`Backup not found: ${backupName}`);
            return;
        }
        
        console.log(`\nBackup Details: ${backupName}`);
        console.log('='.repeat(50));
        
        // Show metadata
        const metadataFile = path.join(backupDir, 'metadata.json');
        if (fs.existsSync(metadataFile)) {
            const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            console.log(`Timestamp: ${metadata.timestamp}`);
            console.log(`Webhook Count: ${metadata.webhookCount}`);
            console.log(`Guild Count: ${metadata.guildCount}`);
            console.log(`Version: ${metadata.version}`);
        }
        
        // Show file sizes
        const webhooksFile = path.join(backupDir, 'channel_webhooks.csv');
        const guildsFile = path.join(backupDir, 'guilds.csv');
        
        if (fs.existsSync(webhooksFile)) {
            const stats = fs.statSync(webhooksFile);
            console.log(`\nchannel_webhooks.csv: ${(stats.size / 1024).toFixed(2)} KB`);
        }
        
        if (fs.existsSync(guildsFile)) {
            const stats = fs.statSync(guildsFile);
            console.log(`guilds.csv: ${(stats.size / 1024).toFixed(2)} KB`);
        }
    }
};

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'list':
            dataUtils.listBackups();
            break;
            
        case 'backup':
            dataUtils.createBackup()
                .then(() => console.log('Backup completed'))
                .catch(error => {
                    console.error('Backup failed:', error);
                    process.exit(1);
                });
            break;
            
        case 'restore':
            const backupName = args[1];
            if (!backupName) {
                console.error('Usage: node data-utils.js restore <backup-name>');
                process.exit(1);
            }
            
            dataUtils.restoreBackup(backupName)
                .then(() => console.log('Restore completed'))
                .catch(error => {
                    console.error('Restore failed:', error);
                    process.exit(1);
                });
            break;
            
        case 'latest':
            const latest = dataUtils.getLatestBackup();
            if (latest) {
                dataUtils.showBackupDetails(latest);
            } else {
                console.log('No backups found');
            }
            break;
            
        case 'details':
            const backupNameForDetails = args[1];
            if (!backupNameForDetails) {
                console.error('Usage: node data-utils.js details <backup-name>');
                process.exit(1);
            }
            
            dataUtils.showBackupDetails(backupNameForDetails);
            break;
            
        default:
            console.log(`
CSV Data Utilities

Usage:
  node data-utils.js list                    - List all available backups
  node data-utils.js backup                  - Create a new backup
  node data-utils.js restore <backup-name>   - Restore from a specific backup
  node data-utils.js latest                  - Show details of the latest backup
  node data-utils.js details <backup-name>   - Show details of a specific backup

Examples:
  node data-utils.js list
  node data-utils.js backup
  node data-utils.js restore backup-2025-01-11T03-00-00-964Z
  node data-utils.js latest
            `);
            break;
    }
}

module.exports = dataUtils; 