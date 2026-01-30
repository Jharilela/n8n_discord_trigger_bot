# Deployment & Advanced Usage

Choose your deployment method:

## Option A: Docker (Recommended for Self-Hosting)

The easiest way to self-host. Runs the bot and PostgreSQL together with one command.

```bash
# Quick start
cp .env.docker.example .env
# Edit .env with your Discord credentials
docker-compose up --build -d
```

See [DOCKER.md](./DOCKER.md) for full instructions.

---

## Option B: Railway (One-Click Cloud Deploy)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/Hx5aTY?referralCode=jay)

Managed cloud hosting with automatic SSL, scaling, and PostgreSQL.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full Railway setup guide.

---

## Option C: Local Development

```bash
# Install dependencies
npm install

# Set up PostgreSQL and configure .env with DATABASE_URL
npm run dev
```

---

## Quick Links
- [Register for n8n](https://n8n.partnerlinks.io/emp0)
- [Register for Railway](https://railway.app)
- [Deploy with Railway Template](https://railway.com/deploy/Hx5aTY?referralCode=jay)

## Documentation

| Guide | Description |
|-------|-------------|
| [DOCKER.md](./DOCKER.md) | Docker Compose deployment |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Railway cloud deployment |
| [GITHUB_SETUP.md](./GITHUB_SETUP.md) | GitHub backup configuration |
| [DATA_BACKUP.md](./DATA_BACKUP.md) | Backup system documentation |

For user setup and usage, see the main [README](../README.md).

---

**Disclaimer:** This project is not affiliated with, endorsed by, or sponsored by Discord or n8n. We are independent developers who created this tool to solve our own integration needs. 