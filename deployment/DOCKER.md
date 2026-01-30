# Docker Deployment Guide

Deploy the n8n Discord Bot using Docker Compose with PostgreSQL.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed
- Discord bot token and client ID (from [Discord Developer Portal](https://discord.com/developers/applications))

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/n8n_discord_trigger_bot.git
cd n8n_discord_trigger_bot

# 2. Create environment file
cp .env.docker.example .env

# 3. Edit .env with your credentials (see below)

# 4. Start everything
docker-compose up --build -d

# 5. View logs
docker-compose logs -f discord-bot
```

## Environment Variables

Edit your `.env` file with these values:

```env
# Required - Discord Bot Credentials
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Required - PostgreSQL (choose a secure password)
POSTGRES_USER=discord_bot
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=discord_bot

# Optional - GitHub Backup (for automatic backup restoration)
GITHUB_USERNAME=your_github_username
GITHUB_REPO=username/repo-name
GITHUB_TOKEN=github_pat_xxxxx
```

### Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Your Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | Your Discord application ID |
| `POSTGRES_USER` | No | PostgreSQL username (default: `discord_bot`) |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password - choose a secure one |
| `POSTGRES_DB` | No | PostgreSQL database name (default: `discord_bot`) |
| `GITHUB_USERNAME` | No | GitHub username for backups |
| `GITHUB_REPO` | No | GitHub repo for backups (format: `username/repo`) |
| `GITHUB_TOKEN` | No | GitHub personal access token for backups |

## Commands Reference

| Command | Description |
|---------|-------------|
| `docker-compose up --build -d` | Build and start containers |
| `docker-compose up -d` | Start containers (no rebuild) |
| `docker-compose logs -f discord-bot` | View bot logs (follow) |
| `docker-compose logs -f postgres` | View database logs |
| `docker-compose ps` | Show running containers |
| `docker-compose stop` | Stop containers (keep data) |
| `docker-compose down` | Stop and remove containers |
| `docker-compose down -v` | Stop, remove containers AND data |
| `docker-compose restart discord-bot` | Restart just the bot |

## Features

### Automatic Backup Restoration

On first run with an empty database, the bot will:
1. Check if the database is empty
2. Fetch the latest backup from your GitHub repo (if configured)
3. Restore all data (webhooks, guilds, admins)
4. Start normally

This means you can destroy and recreate containers without losing data.

### Health Checks

Both services have health checks:
- **PostgreSQL**: Checks database is ready before bot starts
- **Bot**: HTTP health check at `http://localhost:3000/`

### Persistent Data

Two Docker volumes store persistent data:
- `postgres_data` - PostgreSQL database files
- `backup_data` - Local backup files

### Security

- Bot runs as non-root user inside container
- PostgreSQL credentials stored in environment variables
- Network isolation between services

## Verification

### Check Bot Status

```bash
# Health check endpoint
curl http://localhost:3000/

# Expected response:
# {"status":"ok","bot":"connected","timestamp":"..."}
```

### Check Database

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U discord_bot -d discord_bot

# List tables
\dt

# Check webhook count
SELECT COUNT(*) FROM channel_webhooks;

# Exit
\q
```

### View Logs

```bash
# All logs
docker-compose logs

# Bot logs only (follow mode)
docker-compose logs -f discord-bot

# Last 100 lines
docker-compose logs --tail=100 discord-bot
```

## Troubleshooting

### Bot won't start

```bash
# Check logs for errors
docker-compose logs discord-bot

# Common issues:
# - DISCORD_TOKEN is invalid or expired
# - DISCORD_CLIENT_ID is wrong
# - Database not ready (wait for health check)
```

### Database connection errors

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Reset everything

```bash
# Stop and remove all data
docker-compose down -v

# Rebuild from scratch
docker-compose up --build -d
```

### Port already in use

```bash
# Change the port in docker-compose.yml or use environment variable
PORT=3001 docker-compose up -d
```

## Updating

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up --build -d
```

## Production Tips

1. **Use a reverse proxy** (nginx, Traefik) for SSL termination
2. **Set up log rotation** to prevent disk filling up
3. **Monitor with** `docker stats` or container monitoring tools
4. **Backup regularly** - enable GitHub backup integration
5. **Use Docker secrets** for sensitive credentials in production

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Docker Network                  │
│                                                  │
│  ┌──────────────┐       ┌──────────────────┐   │
│  │   postgres   │◄──────│   discord-bot    │   │
│  │  (database)  │       │   (Node.js)      │   │
│  └──────┬───────┘       └────────┬─────────┘   │
│         │                        │              │
│         ▼                        ▼              │
│  ┌──────────────┐       ┌──────────────────┐   │
│  │ postgres_data│       │   backup_data    │   │
│  │   (volume)   │       │    (volume)      │   │
│  └──────────────┘       └──────────────────┘   │
└─────────────────────────────────────────────────┘
                           │
                           ▼ Port 3000
                    ┌──────────────┐
                    │   Internet   │
                    └──────────────┘
```

---

**Need help?** Check the [main README](../README.md) or open an issue on GitHub.
