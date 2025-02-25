require('dotenv').config();
const WebSocket = require('ws');
const { PORT, HOST } = require('./config/api.config');
const { handleConnection } = require('./handlers/connectionHandler');
const { handleMessage } = require('./handlers/messageHandler');
const { initializeGame } = require('./handlers/gameHandler');
const { getUserFromAPI } = require('./services/authService');
const gameState = require('./state/gameState');
const url = require('url');
const https = require('https');
const fs = require('fs');

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

try {
  // SSL sertifikalarını yükle
  const options = {
    key: fs.readFileSync('/app/ssl/privkey.pem'),
    cert: fs.readFileSync('/app/ssl/fullchain.pem')
  };

  // HTTPS sunucusu oluştur
  const server = https.createServer(options, (req, res) => {
    // CORS başlıklarını ayarla
    const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    res.writeHead(200);
    res.end('WebSocket sunucusu çalışıyor!');
  });

  // WebSocket sunucusunu HTTPS sunucusuna bağla
  const wss = new WebSocket.Server({ 
    server,
    // WebSocket için CORS benzeri kontrol
    verifyClient: (info, cb) => {
      const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
      const origin = info.origin || info.req.headers.origin;
      
      if (allowedOrigins.includes('*') || !origin || allowedOrigins.includes(origin)) {
        cb(true);
      } else {
        console.log(`Reddedilen origin: ${origin}`);
        cb(false, 403, 'Origin not allowed');
      }
    }
  });

  // gameState'e WebSocket sunucusunu ekle
  gameState.wss = wss;

  // WebSocket bağlantılarını dinle
  wss.on('connection', async (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`Yeni WebSocket bağlantısı: ${ip}`);
    
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
        console.error(`WebSocket hatası: ${error.message}`);
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

  // Sunucuyu başlat
  const PORT = process.env.PORT || 1881;
  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`Güvenli WebSocket sunucusu çalışıyor: wss://${HOST}:${PORT}`);
    console.log(`İzin verilen originler: ${process.env.CORS_ORIGIN || '*'}`);
    
    // Oyunu başlat
    initializeGame().catch(error => {
      console.error('Oyun başlatma hatası:', error.message);
    });
  });
  
  // Hata yakalama
  server.on('error', (error) => {
    console.error(`Sunucu hatası: ${error.message}`);
  });
  
} catch (error) {
  console.error('Sunucu başlatılırken hata oluştu:', error);
}

// Yakalanmamış hataları yakala
process.on('uncaughtException', (error) => {
  console.error('Yakalanmamış istisna:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('İşlenmeyen reddetme:', reason);
}); 