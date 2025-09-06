const ethers = require('ethers');
const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
app.use(cors({ origin: '*' })); // Ajuste para o domínio do Vercel após implantação
app.use(express.json());
const wsUrl = 'wss://testnet-rpc.monad.xyz';
const transferHash = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const erc721Abi = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function name() view returns (string)"
];
const erc20Abi = [
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN || '8479041589:AAGxID3_S03plHTeNBXt2XTYozGL2O8gVRo');
bot.on('message', (ctx) => {
  try {
    const userChatId = ctx.chat.id.toString();
    console.log(`Message received from ${ctx.from.username || ctx.from.id}, chat_id: ${userChatId}`);
    ctx.reply(`Your chat ID is: ${userChatId}. Copy and use it on the website to receive notifications!`);
  } catch (error) {
    console.error('Error responding to message:', error);
  }
});
bot.launch()
  .then(() => console.log('Bot started successfully!'))
  .catch((error) => console.error('Error starting bot:', error));
const providers = {};
const monitoredWallets = {};
const chatIdsByWallet = {};
const requestQueue = [];
const maxRequestsPerSecond = 20;
let lastRequestTime = 0;
const requestInterval = 1000 / maxRequestsPerSecond;
const globalProvider = new ethers.providers.WebSocketProvider(wsUrl);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_12QonfxkXBZV@ep-rapid-mud-adi8zmh1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        walletAddress TEXT PRIMARY KEY,
        monitorType TEXT NOT NULL,
        chatId TEXT NOT NULL
      )
    `);
    console.log('Table wallets created or already exists.');
    await loadWalletsFromDb();
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
})();
async function throttleRequest(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
}
async function processQueue() {
  if (requestQueue.length === 0) return;
  const now = Date.now();
  if (now - lastRequestTime < requestInterval) {
    setTimeout(processQueue, requestInterval - (now - lastRequestTime));
    return;
  }
  const { fn, resolve, reject } = requestQueue.shift();
  lastRequestTime = now;
  try {
    const result = await fn();
    resolve(result);
  } catch (error) {
    if (error.code === -32007) {
      console.warn('Rate limit reached, waiting...');
      setTimeout(() => {
        requestQueue.unshift({ fn, resolve, reject });
        processQueue();
      }, 1000);
    } else {
      console.error('Request error:', error.reason || error.message);
      reject(error);
    }
  }
}
async function getNftImage(contractAddress, tokenId) {
  try {
    const contract = new ethers.Contract(contractAddress, erc721Abi, globalProvider);
    let tokenUri = await throttleRequest(() => contract.tokenURI(tokenId));
    let metadata;
    if (tokenUri.startsWith('data:application/json;base64,')) {
      const base64Data = tokenUri.split('base64,')[1];
      const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
      metadata = JSON.parse(jsonString);
    } else {
      if (tokenUri.startsWith('ipfs://')) {
        tokenUri = tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      const response = await fetch(tokenUri);
      metadata = await response.json();
    }
    let image = metadata.image;
    if (image && image.startsWith('data:image/')) {
      const parts = image.split(';');
      const mimeType = parts[0].split(':')[1];
      const base64Image = image.split('base64,')[1];
      const buffer = Buffer.from(base64Image, 'base64');
      return { type: mimeType, data: buffer };
    } else if (image && image.startsWith('ipfs://')) {
      image = image.replace('ipfs://', 'https://ipfs.io/ipfs/');
      return { type: 'url', data: image };
    } else if (image) {
      return { type: 'url', data: image };
    }
    return null;
  } catch (error) {
    console.error('Error fetching NFT image:', error.reason || error.message);
    return null;
  }
}
async function getDecimals(contractAddress) {
  try {
    const contract = new ethers.Contract(contractAddress, erc20Abi, globalProvider);
    return await throttleRequest(() => contract.decimals());
  } catch (error) {
    console.error('Error fetching decimals:', error.reason || error.message);
    return 18;
  }
}
async function processTokenOrNftTransfer(log, direction, isErc20, walletAddress) {
  console.log(`Processing ${direction} for wallet ${walletAddress}, log: ${log.transactionHash}`);
  const from = '0x' + log.topics[1].slice(26);
  const to = '0x' + log.topics[2].slice(26);
  const contractAddress = log.address;
  const userChatId = chatIdsByWallet[walletAddress] || '1870880517';
  let collectionOrTokenName = contractAddress;
  let caption;
  let imageInfo = null;
  let formattedTime = 'Unknown';
  try {
    const block = await throttleRequest(() => globalProvider.getBlock(log.blockNumber));
    const timestamp = block.timestamp * 1000;
    const date = new Date(timestamp);
    formattedTime = date.toUTCString();
  } catch (error) {
    console.error('Error fetching timestamp:', error.reason || error.message);
  }
  if (isErc20) {
    const amount = ethers.utils.formatUnits(log.data, await getDecimals(contractAddress));
    try {
      const contract = new ethers.Contract(contractAddress, erc20Abi, globalProvider);
      collectionOrTokenName = await throttleRequest(() => contract.name());
    } catch (error) {
      console.error('Error fetching token name:', error.reason || error.message);
    }
    console.log(`${direction}! Token: ${collectionOrTokenName}, From: ${from}, To: ${to}, Amount: ${amount}, Wallet: ${walletAddress}`);
    let title = direction === 'Token Received' ? '💰 *Token Received!*' : '📤 *Token Sent!*';
    caption = `${title}\n\n🪙 Coin: *${collectionOrTokenName}*\n💸 Amount: *${amount}*\n📩 To: *${to}*\n🕒 Date/Time (GMT 0): *${formattedTime}*`;
  } else {
    const tokenId = parseInt(log.topics[3], 16);
    try {
      const contract = new ethers.Contract(contractAddress, erc721Abi, globalProvider);
      collectionOrTokenName = await throttleRequest(() => contract.name());
    } catch (error) {
      console.error('Error fetching collection name:', error.reason || error.message);
    }
    imageInfo = await getNftImage(contractAddress, tokenId);
    console.log(`${direction}! Collection: ${collectionOrTokenName}, From: ${from}, To: ${to}, Token ID: ${tokenId}, Wallet: ${walletAddress}`);
    let title = direction === 'NFT Received' ? '🎉 *NFT Received!*' : '🚀 *NFT Sent!*';
    caption = `${title}\n\n📄 Collection: *${collectionOrTokenName}*\n📩 To: *${to}*\n🕒 Date/Time (GMT 0): *${formattedTime}*`;
  }
  if (imageInfo) {
    if (imageInfo.type === 'url') {
      bot.telegram.sendPhoto(userChatId, imageInfo.data, { caption: caption, parse_mode: 'Markdown' })
        .then(() => console.log('Message with image (URL) sent to Telegram!'))
        .catch(err => {
          console.error('Error sending with image URL:', err.reason || err.message);
          bot.telegram.sendMessage(userChatId, caption, { parse_mode: 'Markdown' })
            .then(() => console.log('Fallback: Message sent to Telegram (no image)!'))
            .catch(err => console.error('Error in fallback:', err.reason || err.message));
        });
    } else {
      if (imageInfo.type.includes('svg')) {
        bot.telegram.sendDocument(userChatId, { source: imageInfo.data, filename: 'nft.svg' }, { caption: caption, parse_mode: 'Markdown' })
          .then(() => console.log('Message with SVG (document) sent to Telegram!'))
          .catch(err => {
            console.error('Error sending SVG as document:', err.reason || err.message);
            bot.telegram.sendMessage(userChatId, caption, { parse_mode: 'Markdown' })
              .then(() => console.log('Fallback: Message sent to Telegram (no image)!'))
              .catch(err => console.error('Error in fallback:', err.reason || err.message));
          });
      } else {
        bot.telegram.sendPhoto(userChatId, { source: imageInfo.data }, { caption: caption, parse_mode: 'Markdown' })
          .then(() => console.log('Message with image (buffer) sent to Telegram!'))
          .catch(err => {
            console.error('Error sending with image buffer:', err.reason || err.message);
            bot.telegram.sendMessage(userChatId, caption, { parse_mode: 'Markdown' })
              .then(() => console.log('Fallback: Message sent to Telegram (no image)!'))
              .catch(err => console.error('Error in fallback:', err.reason || err.message));
          });
      }
    }
  } else {
    bot.telegram.sendMessage(userChatId, caption, { parse_mode: 'Markdown' })
      .then(() => console.log('Message sent to Telegram (no image)!'))
      .catch(err => console.error('Error sending to Telegram:', err.reason || err.message));
  }
  console.log(`Finished processing ${direction} for wallet ${walletAddress}`);
}
async function processNativeTransfer(tx, direction, walletAddress) {
  console.log(`Processing ${direction} for wallet ${walletAddress}, tx: ${tx.hash}`);
  const from = tx.from.toLowerCase();
  const to = tx.to ? tx.to.toLowerCase() : null;
  const amount = ethers.utils.formatEther(tx.value);
  const blockNumber = tx.blockNumber;
  const userChatId = chatIdsByWallet[walletAddress] || '1870880517';
  let formattedTime = 'Unknown';
  try {
    const block = await throttleRequest(() => globalProvider.getBlock(blockNumber));
    const timestamp = block.timestamp * 1000;
    const date = new Date(timestamp);
    formattedTime = date.toUTCString();
  } catch (error) {
    console.error('Error fetching timestamp:', error.reason || error.message);
  }
  console.log(`${direction}! Coin: MON, From: ${from}, To: ${to}, Amount: ${amount}, Wallet: ${walletAddress}`);
  let title = direction === 'MON Received' ? '💰 *MON Received!*' : '📤 *MON Sent!*';
  const caption = `${title}\n\n🪙 Coin: *MON*\n💸 Amount: *${amount}*\n📩 To: *${to}*\n🕒 Date/Time (GMT 0): *${formattedTime}*`;
  bot.telegram.sendMessage(userChatId, caption, { parse_mode: 'Markdown' })
    .then(() => console.log('Message sent to Telegram (MON, no image)!'))
    .catch(err => console.error('Error sending to Telegram:', err.reason || err.message));
  console.log(`Finished processing ${direction} for wallet ${walletAddress}`);
}
async function throttledProcessBlock(blockNumber, walletAddress) {
  console.log(`Processing block ${blockNumber} for wallet ${walletAddress}`);
  const blockProcessingInterval = 1000;
  try {
    const block = await throttleRequest(() => globalProvider.getBlockWithTransactions(blockNumber));
    if (!block) {
      console.warn(`No block data for block ${blockNumber}, wallet: ${walletAddress}`);
      return;
    }
    for (const tx of block.transactions) {
      if (tx.value.gt(0)) {
        if (tx.to && tx.to.toLowerCase() === walletAddress) {
          await processNativeTransfer(tx, 'MON Received', walletAddress);
        } else if (tx.from.toLowerCase() === walletAddress) {
          await processNativeTransfer(tx, 'MON Sent', walletAddress);
        }
      }
    }
    console.log(`Finished processing block ${blockNumber} for wallet ${walletAddress}`);
  } catch (error) {
    if (error.code === -32007) {
      console.warn(`Rate limit reached for block ${blockNumber}, wallet: ${walletAddress}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, blockProcessingInterval));
      await throttledProcessBlock(blockNumber, walletAddress);
    } else {
      console.error(`Error processing block ${blockNumber} for wallet ${walletAddress}:`, error.reason || error.message);
    }
  }
}
async function monitorBlocks(walletAddress) {
  let lastBlockNumber = await globalProvider.getBlockNumber();
  console.log(`Starting block monitoring for wallet ${walletAddress} at block ${lastBlockNumber}`);
  async function processNextBlock() {
    try {
      const currentBlock = await globalProvider.getBlockNumber();
      if (currentBlock > lastBlockNumber) {
        for (let blockNumber = lastBlockNumber + 1; blockNumber <= currentBlock; blockNumber++) {
          await throttledProcessBlock(blockNumber, walletAddress);
        }
        lastBlockNumber = currentBlock;
      }
    } catch (error) {
      console.error(`Error monitoring blocks for wallet ${walletAddress}:`, error.reason || error.message);
    }
    setTimeout(processNextBlock, 1000);
  }
  processNextBlock();
}
async function startListener(walletAddress, monitorNfts, monitorCoins) {
  if (monitoredWallets[walletAddress]) return;
  providers[walletAddress] = globalProvider;
  const padded = `0x000000000000000000000000${walletAddress.slice(2)}`;
  async function reconnect() {
    console.log(`WebSocket disconnected. Reconnecting...`);
    const newProvider = new ethers.providers.WebSocketProvider(wsUrl);
    for (const addr in providers) {
      providers[addr] = newProvider;
    }
    globalProvider = newProvider;
    setupListeners();
    if (monitorCoins) monitorBlocks(walletAddress);
  }
  function setupListeners() {
    if (monitorNfts) {
      const incoming = { topics: [transferHash, null, padded] };
      const outgoing = { topics: [transferHash, padded, null] };
      globalProvider.on(incoming, (log) => processTokenOrNftTransfer(log, log.topics.length === 3 ? 'Token Received' : 'NFT Received', log.topics.length === 3, walletAddress));
      globalProvider.on(outgoing, (log) => processTokenOrNftTransfer(log, log.topics.length === 3 ? 'Token Sent' : 'NFT Sent', log.topics.length === 3, walletAddress));
    }
    globalProvider._websocket.on('close', () => {
      console.warn(`WebSocket closed`);
      setTimeout(reconnect, 5000);
    });
    globalProvider._websocket.on('error', (error) => {
      console.error(`WebSocket error:`, error);
    });
  }
  setupListeners();
  if (monitorCoins) monitorBlocks(walletAddress);
  monitoredWallets[walletAddress] = true;
  console.log(`Listener started for wallet: ${walletAddress} (NFTs: ${monitorNfts}, Coins: ${monitorCoins})`);
}
async function loadWalletsFromDb() {
  try {
    const result = await pool.query('SELECT * FROM wallets');
    result.rows.forEach(row => {
      const addr = row.walletAddress.toLowerCase();
      chatIdsByWallet[addr] = row.chatId;
      let monitorNfts = false;
      let monitorCoins = false;
      if (row.monitorType === 'both') {
        monitorNfts = true;
        monitorCoins = true;
      } else if (row.monitorType === 'nfts') {
        monitorNfts = true;
      } else if (row.monitorType === 'coins') {
        monitorCoins = true;
      }
      startListener(addr, monitorNfts, monitorCoins);
      console.log(`Loaded and started listener for wallet from DB: ${addr}`);
    });
  } catch (err) {
    console.error('Error loading wallets from DB:', err.message);
  }
}
app.post('/configure', async (req, res) => {
  console.log('Received POST /configure:', req.body);
  try {
    const { walletAddress, monitorType, chatId } = req.body;
    if (!walletAddress || !ethers.utils.isAddress(walletAddress)) {
      console.error('Error: Invalid wallet address:', walletAddress);
      return res.status(400).send('Invalid wallet address!');
    }
    if (!chatId) {
      console.error('Error: Telegram chat ID is required:', chatId);
      return res.status(400).send('Telegram chat ID is required!');
    }
    const addr = walletAddress.toLowerCase();
    let monitorNfts = false;
    let monitorCoins = false;
    if (monitorType === 'both') {
      monitorNfts = true;
      monitorCoins = true;
    } else if (monitorType === 'nfts') {
      monitorNfts = true;
    } else if (monitorType === 'coins') {
      monitorCoins = true;
    } else {
      console.error('Error: Invalid monitor type:', monitorType);
      return res.status(400).send('Invalid monitor type!');
    }
    await pool.query(
      `INSERT INTO wallets (walletAddress, monitorType, chatId) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (walletAddress) 
       DO UPDATE SET monitorType = $2, chatId = $3`,
      [addr, monitorType, chatId]
    );
    chatIdsByWallet[addr] = chatId;
    startListener(addr, monitorNfts, monitorCoins);
    console.log('Configuration applied and saved for wallet:', addr);
    res.send('Configuration applied for wallet: ' + addr);
  } catch (error) {
    console.error('Error in /configure route:', error.message);
    res.status(500).send('Server error: ' + error.message);
  }
});
app.get('/', (req, res) => {
  console.log('Received GET /');
  res.sendFile(__dirname + '/index.html');
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}!`));
process.on('SIGINT', async () => {
  try {
    await pool.end();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error closing database:', err.message);
    process.exit(1);
  }
});