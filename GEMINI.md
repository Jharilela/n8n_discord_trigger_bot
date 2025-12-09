# GEMINI.md: n8n Discord Trigger Bot

This document provides a comprehensive overview of the **n8n Discord Trigger Bot** project, intended to serve as a guide for developers and contributors.

## Project Overview

The n8n Discord Trigger Bot is a Node.js application that acts as a bridge between Discord and various automation platforms like n8n, Zapier, and Make.com. It allows users to forward messages, reactions, and other events from a Discord server to a specified webhook URL.

**Core Functionality:**

*   **Webhook Forwarding:** Forwards Discord events (messages, reactions, threads) to user-configured webhooks.
*   **Slash Commands:** Provides a simple interface for setting up, managing, and monitoring webhooks (`/setup`, `/remove`, `/status`, `/list`).
*   **Multi-Platform Support:** Works with any webhook-based automation tool.
*   **Data Persistence:** Uses a PostgreSQL database to store webhook configurations.
*   **Automated Backups:** Includes a system for automatically backing up the database to CSV files and, optionally, to a GitHub repository.

**Key Technologies:**

*   **Backend:** Node.js
*   **Discord Interaction:** `discord.js`
*   **Database:** PostgreSQL (`pg` library)
*   **HTTP Requests:** `axios`
*   **Scheduling:** `node-cron`
*   **Environment Management:** `dotenv`

**Architecture:**

The application follows a monolithic architecture centered around a single Node.js process.

1.  **`index.js` (Main Application):** The entry point of the bot. It initializes the Discord client, registers slash commands, sets up event listeners for Discord events (messages, reactions, etc.), and handles all incoming interactions.
2.  **`database.js` (Database Layer):** Manages all interactions with the PostgreSQL database. It defines the schema for storing webhook configurations and provides a set of functions for creating, reading, updating, and deleting records.
3.  **`backup.js` (Backup System):** Implements the logic for creating and restoring database backups. It can export data to CSV files and push them to a remote GitHub repository.
4.  **`start.js` (Startup Script):** A wrapper script that ensures all necessary environment variables are set before launching the main application.

## Building and Running

### Prerequisites

*   Node.js (v16 or higher)
*   A PostgreSQL database

### Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/n8n_discord_trigger_bot.git
    cd n8n_discord_trigger_bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Create a `.env` file in the project root and add the following variables. You can use `env.example` as a template.

    ```env
    # Discord Bot Credentials
    DISCORD_TOKEN=your_bot_token
    DISCORD_CLIENT_ID=your_bot_client_id

    # Database Connection
    DATABASE_URL=postgresql://user:password@host:port/database

    # (Optional) GitHub Backup Configuration
    GITHUB_USERNAME=your_github_username
    GITHUB_REPO=your_username/n8n_discord_bot
    GITHUB_TOKEN=your_github_personal_access_token

    # (Optional) Debug Mode
    DEBUG=false
    ```

### Running the Bot

*   **Development Mode:**
    ```bash
    npm run dev
    ```
    This command runs `node index.js` directly, which is suitable for local development.

*   **Production Mode:**
    ```bash
    npm start
    ```
    This command runs `node start.js`, which performs environment checks before starting the application.

### Key Scripts

*   `npm run dev`: Starts the bot in development mode.
*   `npm start`: Starts the bot in production mode.
*   `npm run backup`: Triggers a manual database backup.

## Development Conventions

*   **Code Style:** The codebase uses a consistent style with a focus on clear, readable code. It uses modern JavaScript features (ES6+) where appropriate.
*   **Error Handling:** The application includes robust error handling, especially for webhook forwarding and database operations. Failures are logged, and a retry mechanism with a failure limit is implemented to prevent spamming broken webhooks.
*   **Database Migrations:** Schema changes are handled directly within the `initDatabase` function in `database.js`. New columns and tables are added using `IF NOT EXISTS` to ensure idempotency.
*   **Backups:** The backup system is a critical part of the application. Backups are performed automatically every hour and can be managed manually via scripts. This ensures data can be recovered in case of failure.
*   **Modularity:** The code is organized into logical modules (`index.js`, `database.js`, `backup.js`), separating concerns and making the codebase easier to maintain.
