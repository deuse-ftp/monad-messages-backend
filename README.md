Monad Messages is a wallet monitoring tool for the Monad testnet, sending Telegram notifications for MON, NFTs (ERC-721), or tokens (ERC-20) transfers. The frontend runs on Vercel, the backend on Render, and the database uses Neon (PostgreSQL).
Overview

Frontend: HTML interface for wallet configuration (Vercel).
Backend: Node.js server for blockchain monitoring and Telegram notifications (Render).
Database: PostgreSQL on Neon for wallet persistence.
Telegram Bot: Manages chat ID generation and notifications.

Prerequisites

Node.js installed locally for testing.
Accounts on:
GitHub (for repositories).
Telegram (BotFather for bot creation).
Neon (PostgreSQL database).
Render (backend hosting).
Vercel (frontend hosting).


A Monad testnet wallet for testing.

Setup Steps


1. Create the Telegram Bot

Open Telegram, search for @BotFather, and use /newbot.
Name your bot (e.g., MonadMessagesBot) and set a username (e.g., @monadmessages_bot).
Copy the BOT_TOKEN (e.g., 8479041589:AAGxID3_S03plHTeNBXt2XTYozGL2O8gVRo).
Update backend/index.js with the BOT_TOKEN in process.env.BOT_TOKEN.


2. Configure Neon Database

Sign up at https://neon.tech.
Create a project and database (e.g., neondb).
Copy the connection string (e.g., postgresql://neondb_owner:npg_12QonfxkXBZV@ep-rapid-mud-adi8zmh1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require).
In Neon console or psql, create the table:CREATE TABLE IF NOT EXISTS wallets (
  walletAddress TEXT PRIMARY KEY,
  monitorType TEXT NOT NULL,
  chatId TEXT NOT NULL
);


Set the DATABASE_URL environment variable in Render.



3. Deploy Backend on Render

Create a GitHub repository (e.g., deuse-ftp/monad-messages-backend).
Add index.js, package.json, package-lock.json, and .gitignore (ignore node_modules/).
Sign up at https://render.com.
Create a Web Service, connect your GitHub repository.
Configure:
Runtime: Node.
Build Command: npm install.
Start Command: node index.js.
Environment Variables:
BOT_TOKEN: Your Telegram bot token.
DATABASE_URL: Neon connection string.


Deploy and note the URL (e.g., https://monad-messages-backend.onrender.com).



4. Deploy Frontend on Vercel

Create a GitHub repository (e.g., deuse-ftp/monad-messages-frontend).
Add index.html and vercel.json.
Update index.html fetch URL: https://monad-messages-backend.onrender.com/configure.
Sign up at https://vercel.com.
Create a project, connect your GitHub repository.
Configure:
Framework Preset: Other.
Root Directory: Empty.
Build Command: Empty.
Output Directory: Empty.

Deploy and note the URL (e.g., https://monad-messages-frontend.vercel.app).



5. Test the Application

Open the frontend URL.
Send a message to your Telegram bot to get your chat ID.
Enter chat ID, wallet address, and monitoring type; submit.
Perform a Monad testnet transaction (MON, NFT, or ERC-20).
Check Telegram for notifications.
To keep Render active (free plan): Use cron-job.org to ping /health every 10 minutes.

Notes

Free Plan: Render suspends after 15 minutes of inactivity; use cron job or upgrade to Starter ($7/month).
Security: Set BOT_TOKEN and DATABASE_URL as environment variables. Restrict CORS to frontend URL.
Dependencies: Ensure package.json includes pg for Neon.
Troubleshooting: Check logs in Render, Neon, and Vercel. Test Neon with psql.

For issues, open a ticket on GitHub.
