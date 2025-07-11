#!/usr/bin/env node

// Startup script to handle npm production warnings and provide better error handling
console.log('🚀 Starting n8n Discord Bot...');
console.log('Node.js version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');

// Check if we're in production mode
if (process.env.NODE_ENV === 'production') {
    console.log('📦 Running in production mode');
} else {
    console.log('🔧 Running in development mode');
}

// Validate environment variables before starting
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please set these variables in your environment');
    process.exit(1);
}

// Check optional GitHub variables for backup functionality
const githubVars = ['GITHUB_USERNAME', 'GITHUB_REPO', 'GITHUB_TOKEN'];
const missingGitHubVars = githubVars.filter(varName => !process.env[varName]);

if (missingGitHubVars.length > 0) {
    console.warn('⚠️  Missing GitHub variables for backup functionality:', missingGitHubVars.join(', '));
    console.warn('Backup system will create local backups only');
} else {
    console.log('✅ GitHub backup configuration is set');
}

try {
    // Start the main application
    require('./index.js');
    console.log('✅ Application started successfully');
} catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
} 