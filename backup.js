const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Git configuration for Railway deployment
const configureGit = async () => {
    return new Promise((resolve, reject) => {
        const gitUsername = process.env.GITHUB_USERNAME || 'Railway Bot';
        const gitEmail = process.env.GITHUB_EMAIL || 'bot@railway.app';
        const githubRepo = process.env.GITHUB_REPO || 'your-username/n8n_discord_bot';
        
        const commands = [
            `git config --global user.name "${gitUsername}"`,
            `git config --global user.email "${gitEmail}"`,
            // Set the remote origin if not already set
            `git remote -v | grep origin || git remote add origin https://github.com/${githubRepo}.git`
        ];
        
        let currentCommand = 0;
        
        const runCommand = () => {
            if (currentCommand >= commands.length) {
                console.log('Git configuration completed');
                resolve();
                return;
            }
            
            const command = commands[currentCommand];
            console.log(`Configuring Git: ${command}`);
            
            exec(command, (error, stdout, stderr) => {
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

// Create backups directory if it doesn't exist
const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
}



const createBackup = async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `backup-${timestamp}.sql`);
    
    console.log(`Creating backup: ${backupFile}`);
    
    return new Promise((resolve, reject) => {
        // Use pg_dump to create backup
        const dumpCommand = `pg_dump "${process.env.DATABASE_URL}" > "${backupFile}"`;
        
        exec(dumpCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('Error creating backup:', error);
                reject(error);
                return;
            }
            
            console.log('Backup created successfully');
            resolve(backupFile);
        });
    });
};

const pushToGitHub = async (backupFile) => {
    return new Promise((resolve, reject) => {
        // Check if we're in a Git repository
        exec('git status', (error, stdout, stderr) => {
            if (error) {
                console.warn('Not in a Git repository, skipping GitHub push');
                console.log('Backup file created locally:', backupFile);
                resolve();
                return;
            }
            
            // Configure Git first
            configureGit().then(() => {
                const commands = [
                    'git add .',
                    `git commit -m "Database backup: ${path.basename(backupFile)} - ${new Date().toISOString()}"`,
                    'git push origin main'
                ];
                
                let currentCommand = 0;
                
                const runCommand = () => {
                    if (currentCommand >= commands.length) {
                        console.log('All Git commands completed successfully');
                        resolve();
                        return;
                    }
                    
                    const command = commands[currentCommand];
                    console.log(`Running Git command: ${command}`);
                    
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error running Git command "${command}":`, error);
                            // Don't reject on push errors (might be network issues)
                            if (command.includes('push')) {
                                console.warn('Push failed, but backup file was created locally');
                                resolve();
                            } else {
                                reject(error);
                            }
                            return;
                        }
                        
                        console.log(`Git command completed: ${command}`);
                        currentCommand++;
                        runCommand();
                    });
                };
                
                runCommand();
            }).catch(reject);
        });
    });
};

const cleanupOldBackups = () => {
    const files = fs.readdirSync(backupsDir);
    const backupFiles = files.filter(file => file.startsWith('backup-') && file.endsWith('.sql'));
    
    // Keep only the last 24 backups (one per hour for a day)
    if (backupFiles.length > 24) {
        backupFiles.sort();
        const filesToDelete = backupFiles.slice(0, backupFiles.length - 24);
        
        filesToDelete.forEach(file => {
            const filePath = path.join(backupsDir, file);
            fs.unlinkSync(filePath);
            console.log(`Deleted old backup: ${file}`);
        });
    }
};

const main = async () => {
    try {
        console.log('Starting database backup process...');
        
        // Create backup
        const backupFile = await createBackup();
        
        // Push to GitHub
        await pushToGitHub(backupFile);
        
        // Cleanup old backups
        cleanupOldBackups();
        
        console.log('Backup process completed successfully');
    } catch (error) {
        console.error('Backup process failed:', error);
        process.exit(1);
    }
};

// Run backup if called directly
if (require.main === module) {
    main();
}

module.exports = { createBackup, pushToGitHub, cleanupOldBackups }; 