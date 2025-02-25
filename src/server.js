require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');
const https = require('https');
const http = require('http');
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

// SSL sertifikası ve anahtar dosyalarının yolları
const SSL_ENABLED = process.env.SSL_ENABLED === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

let server;

// SSL etkinse HTTPS sunucusu oluştur, değilse HTTP sunucusu oluştur
if (SSL_ENABLED && SSL_KEY_PATH && SSL_CERT_PATH) {
  try {
    const sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
      minVersion: 'TLSv1.2'
    };
    server = https.createServer(sslOptions);
    console.log('HTTPS server created with SSL');
  } catch (error) {
    console.error('SSL dosyaları yüklenirken hata oluştu:', error.message);
    console.log('HTTP sunucusu oluşturuluyor...');
    server = http.createServer();
  }
} else {
  server = http.createServer();
  console.log('HTTP server created without SSL');
}

// WebSocket sunucusunu oluştur
const wss = new WebSocket.Server({ 
  server: server,
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
        // Oyuncu ID'sini WebSocket nesnesinden al
        const playerId = ws._playerId;
        if (!playerId) {
          console.error('Mesaj işleme hatası: Oyuncu ID bulunamadı');
          return;
        }
        
        // Mesajı işle
        handleMessage(ws, message.toString(), playerId);
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
server.listen(PORT, HOST, () => {
  const protocol = SSL_ENABLED ? 'wss' : 'ws';
  console.log(`WebSocket server running at ${protocol}://${HOST}:${PORT}`);
  
  // Oyunu başlat
  initializeGame().catch(error => {
    console.error('Oyun başlatma hatası:', error.message);
  });
});

// Yakalanmamış hataları yakala
process.on('uncaughtException', (error) => {
  console.error('Yakalanmamış istisna:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('İşlenmeyen reddetme:', reason);
}); 