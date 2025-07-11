# Data Backups

This directory contains CSV backups of the database data, automatically created and version controlled.

## Backup Structure

Each backup is stored in a timestamped directory:
```
data/
├── backup-2025-01-11T03-00-00-964Z/
│   ├── channel_webhooks.csv
│   ├── guilds.csv
│   └── metadata.json   
└── backup-2025-01-11T04-00-00-123Z/
    ├── channel_webhooks.csv
    ├── guilds.csv
    └── metadata.json
```

## Files

- **channel_webhooks.csv**: Contains all channel webhook mappings
- **guilds.csv**: Contains all guild (server) information
- **metadata.json**: Contains backup metadata (timestamp, record counts, version)

## Automatic Backups

Backups are automatically created:
- Every hour via scheduled task
- Automatically committed to Git
- Old backups (older than 24 hours) are automatically cleaned up

## Manual Operations

Use the `data-utils.js` script for manual operations:

```bash
# List all backups
node data-utils.js list

# Create a manual backup
node data-utils.js backup

# Restore from a specific backup
node data-utils.js restore backup-2025-01-11T03-00-00-964Z

# Show latest backup details
node data-utils.js latest

# Show specific backup details
node data-utils.js details backup-2025-01-11T03-00-00-964Z
```

## Advantages of CSV Backup System

1. **No external dependencies**: No need for `pg_dump` or other database tools
2. **Human readable**: CSV files can be opened in Excel, Google Sheets, etc.
3. **Version controlled**: All backups are tracked in Git
4. **Small size**: CSV format is very compact
5. **Easy recovery**: Simple restore process
6. **Cross-platform**: Works on any system with Node.js

## Data Format

### channel_webhooks.csv
```csv
id,channel_id,webhook_url,guild_id,created_at,updated_at
1,123456789012345678,https://n8n.example.com/webhook/abc,987654321098765432,2025-01-11T03:00:00.000Z,2025-01-11T03:00:00.000Z
```

### guilds.csv
```csv
id,name,created_at,updated_at
987654321098765432,My Discord Server,2025-01-11T03:00:00.000Z,2025-01-11T03:00:00.000Z
```

## Recovery

In case of database loss, you can restore from any backup:

1. Ensure the database tables exist (run the application once to initialize)
2. Use the restore command: `node data-utils.js restore <backup-name>`
3. The system will clear existing data and restore from the CSV files

## Security Note

The CSV files contain webhook URLs and Discord IDs. While these are committed to Git, they are not sensitive enough to require encryption for this use case. The webhook URLs are typically internal n8n URLs that are not publicly accessible. 