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
const MessageType = require('./constants/messageTypes');
const { sendToPlayer } = require('./utils/websocket');

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
    key: fs.readFileSync(process.env.SSL_KEY_PATH || '/app/ssl/privkey.pem'),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH || '/app/ssl/fullchain.pem'),
    // Modern TLS sürümlerini zorunlu kıl
    minVersion: 'TLSv1.2',
    // Bu satırı kaldırın veya false yapın - güvenlik sorunu yaratıyor
    // rejectUnauthorized: false
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
wss.on('connection', async (ws, req) => {
  console.log('New WebSocket connection');
  
  try {
    await handleConnection(wss, ws, req);

    // Mesajları dinle
    ws.on('message', async (message) => {
      try {
        // İzleyici modundaki kullanıcılar için mesaj işleme
        if (ws._isViewer) {
          console.log('İzleyici mesaj göndermeye çalıştı, işlenmedi');
          sendToPlayer(ws, {
            type: MessageType.ERROR,
            message: 'İzleyici modunda mesaj gönderemezsiniz'
          });
          return;
        }
        
        // Oyuncu ID'sini WebSocket nesnesinden al
        const playerId = ws._playerId;
        if (!playerId) {
          console.error('Player ID bulunamadı');
          return;
        }

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

  // Sunucuyu başlat
  const PORT = process.env.PORT || 1881;
  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`Güvenli WebSocket sunucusu çalışıyor: wss://${HOST}:${PORT}`);
    console.log(`İzin verilen originler: ${process.env.CORS_ORIGIN || '*'}`);
    
    // Oyunu başlat - bunun çalıştığından emin olalım
    initializeGame().catch(error => {
      console.error('Oyun başlatma hatası:', error.message);
    });
    
    // Chat geçmişini her 24 saatte bir temizle
    setupChatHistoryCleaner();
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

/**
 * Chat geçmişini düzenli olarak temizlemek için zamanlayıcı oluşturur
 */
function setupChatHistoryCleaner() {
  const gameState = require('./state/gameState');
  
  // İlk temizleme zamanını hesapla (bir sonraki gece yarısı)
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  
  // İlk çalıştırmaya kadar beklenecek süre (milisaniye cinsinden)
  const initialDelay = nextMidnight.getTime() - now.getTime();
  
  console.log(`Chat geçmişi temizleme zamanlayıcısı kuruldu. İlk temizleme ${new Date(now.getTime() + initialDelay).toLocaleString('tr-TR')} tarihinde yapılacak.`);
  
  // İlk zamanlayıcıyı kur
  setTimeout(() => {
    // Chat geçmişini temizle
    cleanChatHistory();
    
    // Sonraki günlük temizlemeleri ayarla (her 24 saatte bir)
    setInterval(cleanChatHistory, 24 * 60 * 60 * 1000);
  }, initialDelay);
}

/**
 * Chat geçmişini temizler
 */
function cleanChatHistory() {
  const gameState = require('./state/gameState');
  
  // Temizlemeden önce kaç mesaj olduğunu kaydet
  const messageCount = gameState.chatHistory ? gameState.chatHistory.length : 0;
  
  // Chat geçmişini boş bir dizi ile değiştir
  gameState.chatHistory = [];
  
  console.log(`Chat geçmişi temizlendi. ${messageCount} mesaj silindi. ${new Date().toLocaleString('tr-TR')}`);
} 