require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PORT, HOST } = require('./config/api.config');
const { handleConnection } = require('./handlers/connectionHandler');
const { handleMessage } = require('./handlers/messageHandler');
const { initializeGame } = require('./handlers/gameHandler');
const { getUserFromAPI } = require('./services/authService');
const gameState = require('./state/gameState');

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

// HTTP sunucusu oluştur
const httpServer = createServer();

// Socket.IO sunucusunu oluştur
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Güvenlik için production'da düzenleyin
    methods: ["GET", "POST"]
  },
  transports: ['websocket'],
  pingTimeout: 30000,
  pingInterval: 25000
});

// gameState'e Socket.IO sunucusunu ekle
gameState.io = io;

// Bağlantı öncesi token kontrolü (middleware)
io.use(async (socket, next) => {
  try {
    const token = cleanToken(socket.handshake.headers.authorization);
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const userData = await getUserFromAPI(token);
    if (!userData) {
      return next(new Error('Invalid token or user not found'));
    }

    // Socket nesnesine kullanıcı bilgilerini ekle
    socket.userData = userData;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// Socket.IO bağlantılarını dinle
io.on('connection', async (socket) => {
  console.log('New Socket.IO connection');
  
  try {
    await handleConnection(io, socket);

    // Mesajları dinle
    socket.on('answer', (message) => {
      try {
        handleMessage(socket, message, socket.userData.id);
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    // Bağlantı hatalarını dinle
    socket.on('error', (error) => {
      console.error('Socket.IO error:', error);
    });

    // Bağlantı kapandığında
    socket.on('disconnect', (reason) => {
      console.log(`Socket.IO disconnected for player: ${socket.userData.id}, Reason: ${reason}`);
    });

  } catch (error) {
    console.error('Connection handling error:', error);
    socket.disconnect(true);
  }
});

// Socket.IO sunucusu hata yönetimi
io.on('error', (error) => {
  console.error('Socket.IO server error:', error);
});

// Sunucuyu başlat ve oyunu başlat
httpServer.listen(PORT, HOST, () => {
  console.log(`Socket.IO server running at http://${HOST}:${PORT}`);
  
  // Oyunu başlat
  initializeGame().catch(error => {
    console.error('Oyun başlatma hatası:', error.message);
  });
}); 