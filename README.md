**Monad Messages** is a wallet monitoring tool for the **Monad testnet**, sending **Telegram notifications** for **MON**, **NFTs (ERC-721)**, or **tokens (ERC-20)** transfers. The frontend runs on **Vercel**, the backend on **Render**, and the database uses **Neon (PostgreSQL)**.

## Overview

- **Frontend**: HTML interface for wallet configuration (Vercel).
- **Backend**: Node.js server for blockchain monitoring and Telegram notifications (Render).
- **Database**: PostgreSQL on Neon for wallet persistence.
- **Telegram Bot**: Manages chat ID generation and notifications.

## Prerequisites

- **Node.js** installed locally for testing.
- Accounts on:
  - **GitHub** (for repositories).
  - **Telegram** (BotFather for bot creation).
  - **Neon** (PostgreSQL database).
  - **Render** (backend hosting).
  - **Vercel** (frontend hosting).
- A **Monad testnet wallet** for testing.

## Setup Steps

### 1. Create the Telegram Bot

1. Open **Telegram**, search for **@BotFather**, and use `/newbot`.
2. Name your bot (e.g., **MonadMessagesBot**) and set a username (e.g., **@monadmessages_bot**).
3. Copy the **BOT_TOKEN** (e.g., `8479041589:AAGxID3_S03plHTeNBXt2XTYozGL2O8gVRo`).
4. Update `backend/index.js` with the **BOT_TOKEN** in `process.env.BOT_TOKEN`.

### 2. Configure Neon Database

1. Sign up at **https://neon.tech**.
2. Create a project and database (e.g., **neondb**).
3. Copy the connection string (e.g., `postgresql://neondb_owner:npg_12QonfxkXBZV@ep-rapid-mud-adi8zmh1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require`).
4. In **Neon console** or **psql**, create the table:

```sql
CREATE TABLE IF NOT EXISTS wallets (
  walletAddress TEXT PRIMARY KEY,
  monitorType TEXT NOT NULL,
  chatId TEXT NOT NOT NULL
);
```

5. Set the **DATABASE_URL** environment variable in **Render**.

### 3. Deploy Backend on Render

1. Create a **GitHub repository** (e.g., `deuse-ftp/monad-messages-backend`).
2. Add `index.js`, `package.json`, `package-lock.json`, and `.gitignore` (ignore `node_modules/`).
3. Sign up at **https://render.com**.
4. Create a **Web Service**, connect your **GitHub repository**.
5. Configure:
   - **Runtime**: Node.
   - **Build Command**: `npm install`.
   - **Start Command**: `node index.js`.
   - **Environment Variables**:
     - **BOT_TOKEN**: Your Telegram bot token.
     - **DATABASE_URL**: Neon connection string.
6. Deploy and note the URL (e.g., **https://monad-messages-backend.onrender.com**).
7. To prevent spin-down (free plan), set up a cron job at **https://cron-job.org** to ping `/health` every 10 minutes.

### 4. Deploy Frontend on Vercel

1. Create a **GitHub repository** (e.g., `deuse-ftp/monad-messages-frontend`).
2. Add `index.html` and `vercel.json`.
3. Update `index.html` fetch URL: **https://monad-messages-backend.onrender.com/configure**.
4. Sign up at **https://vercel.com**.
5. Create a project, connect your **GitHub repository**.
6. Configure:
   - **Framework Preset**: Other.
   - **Root Directory**: Empty.
   - **Build Command**: Empty.
   - **Output Directory**: Empty.
7. Deploy and note the URL (e.g., **https://monad-messages-frontend.vercel.app**).

### 5. Test the Application

1. Open the **frontend URL**.
2. Send a message to your **Telegram bot** to get your **chat ID**.
3. Enter **chat ID**, **wallet address**, and **monitoring type**; submit.
4. Perform a **Monad testnet transaction** (MON, NFT, or ERC-20).
5. Check **Telegram** for notifications.

## Notes

- **Free Plan**: Render suspends after 15 minutes of inactivity; use a cron job or upgrade to Starter ($7/month).
- **Security**: Set **BOT_TOKEN** and **DATABASE_URL** as environment variables. Restrict CORS to the frontend URL.
- **Dependencies**: Ensure `package.json` includes `pg` for Neon.
- **Troubleshooting**: Check logs in **Render**, **Neon**, and **Vercel**. Test Neon with **psql**.
