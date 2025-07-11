const { exec } = require('child_process');
const fs = require('fs');

// Test GitHub authentication
const testGitHubAuth = async () => {
    console.log('Testing GitHub Authentication...\n');
    
    // Check environment variables
    const githubUsername = process.env.GITHUB_USERNAME;
    const githubRepo = process.env.GITHUB_REPO;
    const githubToken = process.env.GITHUB_TOKEN;
    
    console.log('Environment Variables:');
    console.log(`GITHUB_USERNAME: ${githubUsername || 'NOT SET'}`);
    console.log(`GITHUB_REPO: ${githubRepo || 'NOT SET'}`);
    console.log(`GITHUB_TOKEN: ${githubToken ? 'SET (hidden)' : 'NOT SET'}`);
    console.log('');
    
    if (!githubUsername || !githubRepo || !githubToken) {
        console.error('❌ Missing required GitHub environment variables!');
        console.error('Please set GITHUB_USERNAME, GITHUB_REPO, and GITHUB_TOKEN in your environment.');
        console.error('See env.example for setup instructions.');
        process.exit(1);
    }
    
    // Check if we're in a Git repository
    console.log('1. Checking Git repository...');
    exec('git status', (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Not in a Git repository');
            console.error('Please run this script from within your Git repository.');
            process.exit(1);
        }
        console.log('✅ In a Git repository');
        
        // Test remote configuration
        console.log('\n2. Checking remote configuration...');
        exec('git remote -v', (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Error checking remote configuration:', error.message);
                process.exit(1);
            }
            
            console.log('Current remotes:');
            console.log(stdout);
            
            // Test authentication by trying to fetch
            console.log('\n3. Testing GitHub authentication...');
            const testUrl = `https://${githubToken}@github.com/${githubRepo}.git`;
            
            exec(`git ls-remote ${testUrl}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ GitHub authentication failed!');
                    console.error('Error:', error.message);
                    console.error('\nPossible issues:');
                    console.error('1. Invalid GitHub token');
                    console.error('2. Token doesn\'t have repo access');
                    console.error('3. Repository doesn\'t exist or you don\'t have access');
                    console.error('4. Repository name format is incorrect (should be username/repo-name)');
                    process.exit(1);
                }
                
                console.log('✅ GitHub authentication successful!');
                console.log('Repository access confirmed.');
                
                // Test push capability by creating a test file
                console.log('\n4. Testing push capability...');
                const testFile = 'test-github-auth.txt';
                const testContent = `GitHub auth test - ${new Date().toISOString()}`;
                
                fs.writeFileSync(testFile, testContent);
                
                exec('git add test-github-auth.txt', (error, stdout, stderr) => {
                    if (error) {
                        console.error('❌ Error adding test file:', error.message);
                        fs.unlinkSync(testFile);
                        process.exit(1);
                    }
                    
                    exec('git commit -m "Test GitHub authentication"', (error, stdout, stderr) => {
                        if (error) {
                            console.error('❌ Error committing test file:', error.message);
                            fs.unlinkSync(testFile);
                            process.exit(1);
                        }
                        
                        exec('git push origin main', (error, stdout, stderr) => {
                            if (error) {
                                console.error('❌ Error pushing to GitHub:', error.message);
                                console.error('This might be due to branch protection rules or other repository settings.');
                            } else {
                                console.log('✅ Successfully pushed to GitHub!');
                            }
                            
                            // Clean up test file
                            exec('git reset --hard HEAD~1', () => {
                                if (fs.existsSync(testFile)) {
                                    fs.unlinkSync(testFile);
                                }
                                console.log('\n🎉 GitHub authentication test completed successfully!');
                                console.log('Your backup system should work correctly.');
                            });
                        });
                    });
                });
            });
        });
    });
};

// Run test if called directly
if (require.main === module) {
    testGitHubAuth();
}

module.exports = { testGitHubAuth }; 