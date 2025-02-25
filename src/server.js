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
    cert: fs.readFileSync('/app/ssl/fullchain.pem'),
    // IP adresi için gerekli
    rejectUnauthorized: false
  };

  // HTTPS sunucusu oluştur
  const server = https.createServer(options, (req, res) => {
    // CORS başlıklarını ayarla
    res.setHeader('Access-Control-Allow-Origin', '*');
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
  const wss = new WebSocket.Server({ server });

  // gameState'e WebSocket sunucusunu ekle
  gameState.wss = wss;

  // WebSocket bağlantılarını dinle
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`Yeni WebSocket bağlantısı: ${ip}`);
    
    // Token kontrolü
    const parameters = url.parse(req.url, true).query;
    const token = parameters.token;
    
    if (!token) {
      console.log('Token eksik, bağlantı kapatılıyor');
      ws.close(1008, 'Token required');
      return;
    }
    
    console.log('Bağlantı başarılı, token alındı');
    
    // Mevcut WebSocket işleyicileriniz...
    ws.on('message', (message) => {
      console.log(`Alınan mesaj: ${message}`);
      try {
        // Mesaj işleme...
        ws.send(JSON.stringify({ type: 'echo', data: message.toString() }));
      } catch (error) {
        console.error('Mesaj işleme hatası:', error);
      }
    });
    
    ws.on('close', () => {
      console.log(`Bağlantı kapatıldı: ${ip}`);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket hatası: ${error.message}`);
    });
    
    // Bağlantı başarılı mesajı
    try {
      ws.send(JSON.stringify({ type: 'connection', status: 'success' }));
    } catch (error) {
      console.error('Bağlantı mesajı gönderme hatası:', error);
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