const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

// Git configuration for Railway deployment with GitHub token support
const configureGit = async () => {
    return new Promise((resolve, reject) => {
        const gitUsername = process.env.GITHUB_USERNAME || 'Railway Bot';
        const gitEmail = process.env.GITHUB_EMAIL || 'bot@railway.app';
        const githubRepo = process.env.GITHUB_REPO || 'your-username/n8n_discord_bot';
        const githubToken = process.env.GITHUB_TOKEN;
        
        // Check if GitHub token is available
        if (!githubToken) {
            console.warn('GITHUB_TOKEN not found in environment variables. GitHub push may fail.');
        }
        
        const commands = [
            `git config --global user.name "${gitUsername}"`,
            `git config --global user.email "${gitEmail}"`
        ];
        
        // Set up remote origin with token authentication if available
        if (githubToken) {
            commands.push(`git remote set-url origin https://${githubToken}@github.com/${githubRepo}.git`);
        } else {
            commands.push(`git remote -v | grep origin || git remote add origin https://github.com/${githubRepo}.git`);
        }
        
        let currentCommand = 0;
        
        const runCommand = () => {
            if (currentCommand >= commands.length) {
                console.log('Git configuration completed');
                resolve();
                return;
            }
            
            const command = commands[currentCommand];
            console.log(`Configuring Git: ${command.replace(githubToken || '', '[TOKEN_HIDDEN]')}`);
            
            exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
                if (error && !command.includes('grep')) {
                    console.warn(`Warning during Git config: ${error.message}`);
                }
                
                currentCommand++;
                runCommand();
            });
        };
        
        runCommand();
    });
};

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Export database to CSV files
const exportToCSV = async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(dataDir, `backup-${timestamp}`);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    
    console.log(`Creating CSV backup: ${backupDir}`);
    
    try {
        const client = await pool.connect();
        
        // Export channel_webhooks table
        const webhooksResult = await client.query('SELECT * FROM channel_webhooks ORDER BY created_at');
        const webhooksFile = path.join(backupDir, 'channel_webhooks.csv');
        
        if (webhooksResult.rows.length > 0) {
            const headers = Object.keys(webhooksResult.rows[0]).join(',');
            const rows = webhooksResult.rows.map(row => 
                Object.values(row).map(value => 
                    typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
                ).join(',')
            );
            const csvContent = [headers, ...rows].join('\n');
            fs.writeFileSync(webhooksFile, csvContent);
            console.log(`Exported ${webhooksResult.rows.length} webhook records`);
        } else {
            // Create empty file with headers
            const headers = 'id,channel_id,webhook_url,guild_id,created_at,updated_at';
            fs.writeFileSync(webhooksFile, headers);
            console.log('No webhook records to export');
        }
        
        // Export guilds table
        const guildsResult = await client.query('SELECT * FROM guilds ORDER BY created_at');
        const guildsFile = path.join(backupDir, 'guilds.csv');
        
        if (guildsResult.rows.length > 0) {
            const headers = Object.keys(guildsResult.rows[0]).join(',');
            const rows = guildsResult.rows.map(row => 
                Object.values(row).map(value => 
                    typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
                ).join(',')
            );
            const csvContent = [headers, ...rows].join('\n');
            fs.writeFileSync(guildsFile, csvContent);
            console.log(`Exported ${guildsResult.rows.length} guild records`);
        } else {
            // Create empty file with headers
            const headers = 'id,name,created_at,updated_at';
            fs.writeFileSync(guildsFile, headers);
            console.log('No guild records to export');
        }
        
        // Create metadata file
        const metadata = {
            timestamp: new Date().toISOString(),
            webhookCount: webhooksResult.rows.length,
            guildCount: guildsResult.rows.length,
            version: '1.0'
        };
        const metadataFile = path.join(backupDir, 'metadata.json');
        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
        
        client.release();
        console.log('CSV export completed successfully');
        return backupDir;
        
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        throw error;
    }
};

const pushToGitHub = async (backupDir) => {
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || 'your-username/n8n_discord_bot';
    
    if (!githubToken) {
        console.warn('GITHUB_TOKEN not found, skipping GitHub push');
        console.log('Backup files created locally:', backupDir);
        return;
    }
    
    try {
        const fs = require('fs');
        const path = require('path');
        const axios = require('axios');
        
        console.log('Pushing backup to GitHub via API...');
        
        // Read backup files
        const backupName = path.basename(backupDir);
        const webhooksFile = path.join(backupDir, 'channel_webhooks.csv');
        const guildsFile = path.join(backupDir, 'guilds.csv');
        const metadataFile = path.join(backupDir, 'metadata.json');
        
        const webhooksContent = fs.existsSync(webhooksFile) ? fs.readFileSync(webhooksFile, 'utf8') : '';
        const guildsContent = fs.existsSync(guildsFile) ? fs.readFileSync(guildsFile, 'utf8') : '';
        const metadataContent = fs.existsSync(metadataFile) ? fs.readFileSync(metadataFile, 'utf8') : '';
        
        // GitHub API headers
        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'n8n-discord-bot'
        };
        
        // Create/update files via GitHub API
        const files = [
            { path: `data/${backupName}/channel_webhooks.csv`, content: webhooksContent },
            { path: `data/${backupName}/guilds.csv`, content: guildsContent },
            { path: `data/${backupName}/metadata.json`, content: metadataContent }
        ];
        
        for (const file of files) {
            const encodedContent = Buffer.from(file.content).toString('base64');
            
            // Check if file exists
            let sha = null;
            try {
                const getResponse = await axios.get(
                    `https://api.github.com/repos/${githubRepo}/contents/${file.path}`,
                    { headers }
                );
                sha = getResponse.data.sha;
            } catch (error) {
                // File doesn't exist, that's fine
            }
            
            // Create or update file
            const payload = {
                message: `Database backup: ${backupName} - ${new Date().toISOString()}`,
                content: encodedContent
            };
            
            if (sha) {
                payload.sha = sha;
            }
            
            await axios.put(
                `https://api.github.com/repos/${githubRepo}/contents/${file.path}`,
                payload,
                { headers }
            );
            
            console.log(`✅ Uploaded ${file.path} to GitHub`);
        }
        
        console.log('✅ All backup files pushed to GitHub successfully');
        
    } catch (error) {
        console.error('Error pushing to GitHub:', error.response?.data || error.message);
        console.log('Backup files created locally:', backupDir);
    }
};

const cleanupOldBackups = () => {
    const files = fs.readdirSync(dataDir);
    const backupDirs = files.filter(file => 
        file.startsWith('backup-') && 
        fs.statSync(path.join(dataDir, file)).isDirectory()
    );
    
    // Keep only the last 24 backups (one per hour for a day)
    if (backupDirs.length > 24) {
        backupDirs.sort();
        const dirsToDelete = backupDirs.slice(0, backupDirs.length - 24);
        
        dirsToDelete.forEach(dir => {
            const dirPath = path.join(dataDir, dir);
            fs.rmSync(dirPath, { recursive: true, force: true });
            console.log(`Deleted old backup: ${dir}`);
        });
    }
};

// Restore function to import data from CSV
const restoreFromCSV = async (backupDir) => {
    console.log(`Restoring from backup: ${backupDir}`);
    
    try {
        const client = await pool.connect();
        
        // Read and restore channel_webhooks
        const webhooksFile = path.join(backupDir, 'channel_webhooks.csv');
        if (fs.existsSync(webhooksFile)) {
            const webhooksContent = fs.readFileSync(webhooksFile, 'utf8');
            const lines = webhooksContent.split('\n').filter(line => line.trim());
            
            if (lines.length > 1) { // Has data beyond header
                // Clear existing data
                await client.query('DELETE FROM channel_webhooks');
                
                // Parse CSV and insert data
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(val => 
                        val.startsWith('"') && val.endsWith('"') ? 
                        val.slice(1, -1).replace(/""/g, '"') : val
                    );
                    
                    await client.query(`
                        INSERT INTO channel_webhooks (id, channel_id, webhook_url, guild_id, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, values);
                }
                console.log(`Restored ${lines.length - 1} webhook records`);
            }
        }
        
        // Read and restore guilds
        const guildsFile = path.join(backupDir, 'guilds.csv');
        if (fs.existsSync(guildsFile)) {
            const guildsContent = fs.readFileSync(guildsFile, 'utf8');
            const lines = guildsContent.split('\n').filter(line => line.trim());
            
            if (lines.length > 1) { // Has data beyond header
                // Clear existing data
                await client.query('DELETE FROM guilds');
                
                // Parse CSV and insert data
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(val => 
                        val.startsWith('"') && val.endsWith('"') ? 
                        val.slice(1, -1).replace(/""/g, '"') : val
                    );
                    
                    await client.query(`
                        INSERT INTO guilds (id, name, created_at, updated_at)
                        VALUES ($1, $2, $3, $4)
                    `, values);
                }
                console.log(`Restored ${lines.length - 1} guild records`);
            }
        }
        
        client.release();
        console.log('Restore completed successfully');
        
    } catch (error) {
        console.error('Error restoring from CSV:', error);
        throw error;
    }
};

const main = async () => {
    try {
        console.log('Starting CSV database backup process...');
        
        // Export to CSV
        const backupDir = await exportToCSV();
        
        // Push to GitHub
        await pushToGitHub(backupDir);
        
        // Cleanup old backups
        cleanupOldBackups();
        
        console.log('CSV backup process completed successfully');
    } catch (error) {
        console.error('CSV backup process failed:', error);
        process.exit(1);
    }
};

// Run backup if called directly
if (require.main === module) {
    main();
}

module.exports = { exportToCSV, pushToGitHub, cleanupOldBackups, restoreFromCSV }; 