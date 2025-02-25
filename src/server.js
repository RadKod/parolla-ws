require('dotenv').config();
const WebSocket = require('ws');
const { PORT, HOST } = require('./config/api.config');
const { handleConnection } = require('./handlers/connectionHandler');
const { handleMessage } = require('./handlers/messageHandler');
const { initializeGame } = require('./handlers/gameHandler');
const { getUserFromAPI } = require('./services/authService');
const gameState = require('./state/gameState');
const url = require('url');

/**
 * Token'ı temizler (Bearer prefix'ini kaldırır)
 * @param {string} token Ham token
 * @returns {string} Temizlenmiş token
 */
function cleanToken(token) {
  if (!token) return null;
  
  // Bearer prefix'ini kaldır
  if (token.startsWith('Bearer ')) {
    return token.slice(7).trim();
  }
  
  return token.trim();
}

// WebSocket sunucusunu oluştur
const wss = new WebSocket.Server({ 
  port: PORT,
  host: HOST,
  clientTracking: true,
  perMessageDeflate: false
});

// gameState'e WebSocket sunucusunu ekle
gameState.wss = wss;

// WebSocket bağlantılarını dinle
wss.on('connection', async (ws, req) => {
  console.log('New WebSocket connection');
  
  try {
    await handleConnection(wss, ws, req);

    // Mesajları dinle
    ws.on('message', async (message) => {
      try {
        // URL'den token parametresini al ve temizle
        const { query } = url.parse(req.url, true);
        const token = cleanToken(query.token);
        if (!token) return;

        const userData = await getUserFromAPI(token);
        if (!userData) return;

        handleMessage(ws, message.toString(), userData.id);
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    // Bağlantı hatalarını dinle
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

  } catch (error) {
    console.error('Connection handling error:', error);
    ws.close();
  }
});

// WebSocket sunucusu hata yönetimi
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Sunucuyu başlat ve oyunu başlat
wss.on('listening', () => {
  console.log(`WebSocket server running at ws://${HOST}:${PORT}`);
  
  // Oyunu başlat
  initializeGame().catch(error => {
    console.error('Oyun başlatma hatası:', error.message);
  });
}); 