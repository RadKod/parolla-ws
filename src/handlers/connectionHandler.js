const WebSocket = require('ws');
const MessageType = require('../constants/messageTypes');
const Player = require('../models/Player');
const { getUserFromAPI } = require('../services/authService');
const { broadcast, sendToPlayer } = require('../utils/websocket');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const gameState = require('../state/gameState');
const { sendNewQuestion, startTimeUpdateInterval } = require('./gameHandler');
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

/**
 * Bağlantı kapandığında yapılacak işlemler
 * @param {string} playerId Oyuncu ID'si
 */
function handleDisconnect(playerId) {
  try {
    const player = gameState.players.get(playerId);
    if (!player) return;

    // WebSocket bağlantısını kapat
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.terminate(); // force close
    }

    gameState.players.delete(playerId);
    
    if (gameState.players.size === 0) {
      // Tüm zamanlayıcıları temizle
      if (gameState.roundTimer) {
        clearTimeout(gameState.roundTimer);
        gameState.roundTimer = null;
      }
      
      if (gameState.timeUpdateInterval) {
        clearInterval(gameState.timeUpdateInterval);
        gameState.timeUpdateInterval = null;
      }
      
      // Oyun durumunu koruyoruz, sadece zamanlayıcıları durduruyoruz
      gameState.waitingStartTime = null; // Sadece bekleme süresini sıfırla
      gameState.lastQuestionTime = Date.now(); // Süreyi güncelle
    }

    // Diğer oyunculara bildir
    broadcast(gameState.wss, {
      type: MessageType.PLAYER_LEFT,
      playerId: playerId,
      remainingPlayers: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        fingerprint: p.fingerprint,
        is_permanent: p.is_permanent,
        lives: p.lives,
        score: p.score
      }))
    });
  } catch (error) {
    console.error('Disconnect handling error:', error);
  }
}

/**
 * Yeni bir WebSocket bağlantısını yönetir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {Object} req HTTP isteği
 */
async function handleConnection(wss, ws, req) {
  let pingInterval;
  let isAlive = true;
  let playerId = null;

  try {
    // URL'den token parametresini al ve temizle
    const { query } = url.parse(req.url, true);
    const token = cleanToken(query.token);

    if (!token) {
      sendToPlayer(ws, {
        type: MessageType.ERROR,
        message: 'Authentication required'
      });
      ws.terminate();
      return;
    }

    // Kullanıcı bilgilerini API'den al
    const userData = await getUserFromAPI(token);
    if (!userData) {
      sendToPlayer(ws, {
        type: MessageType.ERROR,
        message: 'Invalid token or user not found'
      });
      ws.terminate();
      return;
    }

    playerId = userData.id;

    // WebSocket nesnesine player ID'yi ekle
    ws._playerId = playerId;

    // Eğer aynı kullanıcının önceki bağlantısı varsa kapat
    const existingPlayer = gameState.players.get(userData.id);
    if (existingPlayer) {
      // Önceki bağlantıyı kapat
      if (existingPlayer.ws && existingPlayer.ws.readyState === WebSocket.OPEN) {
        existingPlayer.ws.terminate(); // force close
      }
      // Oyuncu listesinden kaldır
      gameState.players.delete(userData.id);
      // Kapanmanın tamamlanmasını bekle
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Oyuncuyu oluştur
    const player = new Player(ws, userData);

    // Eğer mevcut round'da can durumu varsa onu kullan
    if (gameState.currentQuestion) {
      const roundKey = `${gameState.questionIndex}_${playerId}`;
      const roundLives = gameState.roundLives.get(roundKey);
      if (roundLives !== undefined) {
        player.lives = roundLives;
      }
    }

    // Ping/Pong mekanizması kur
    isAlive = true;
    pingInterval = setInterval(() => {
      if (!isAlive) {
        clearInterval(pingInterval);
        return ws.terminate();
      }
      isAlive = false;
      ws.ping();
    }, 30000);

    ws.on('pong', () => {
      isAlive = true;
    });

    // Bağlantı hatalarını dinle
    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      clearInterval(pingInterval);
      handleDisconnect(userData.id);
    });

    // Bağlantı kapandığında
    ws.on('close', () => {
      clearInterval(pingInterval);
      handleDisconnect(userData.id);
    });

    // Oyuncuyu kaydet
    gameState.players.set(userData.id, player);

    // Oyuncuya bilgilerini gönder
    sendToPlayer(ws, {
      type: MessageType.CONNECTED,
      player: {
        id: player.id,
        name: player.name,
        fingerprint: player.fingerprint,
        is_permanent: player.is_permanent,
        lives: player.lives,
        score: player.score
      },
      gameInfo: {
        roundTime: gameState.ROUND_TIME,
        maxLives: gameState.MAX_LIVES,
        totalQuestions: gameState.questions.length,
        currentPlayers: Array.from(gameState.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          fingerprint: p.fingerprint,
          is_permanent: p.is_permanent,
          lives: p.lives,
          score: p.score
        }))
      }
    });

    // Diğer oyunculara yeni oyuncunun katıldığını bildir
    broadcast(gameState.wss, {
      type: MessageType.PLAYER_JOINED,
      player: {
        id: player.id,
        name: player.name,
        fingerprint: player.fingerprint,
        is_permanent: player.is_permanent,
        lives: player.lives,
        score: player.score
      }
    }, [player.id]); // Yeni katılan oyuncuya gönderme

    // İlk oyuncu bağlandığında oyunu başlat
    if (gameState.players.size === 1 && !gameState.currentQuestion && gameState.questionIndex === 0) {
      sendNewQuestion();
    } 
    // Mevcut soru varsa yeni bağlanan oyuncuya gönder
    else if (gameState.currentQuestion) {
      const timeInfo = getRemainingTime(gameState.lastQuestionTime);
      
      // Mevcut soruyu gönder
      sendToPlayer(ws, {
        type: MessageType.QUESTION,
        question: {
          id: gameState.currentQuestion.id,
          question: gameState.currentQuestion.question,
          letter: gameState.currentQuestion.letter
        },
        gameStatus: {
          roundTime: gameState.ROUND_TIME,
          questionNumber: gameState.questionIndex + 1,
          totalQuestions: gameState.questions.length,
          timestamp: gameState.lastQuestionTime,
          remaining: timeInfo.remaining
        }
      });

      // Eğer bekleme süresindeyse ve soru süresi bitmişse, bekleme süresini gönder
      if (gameState.waitingStartTime && timeInfo.remaining <= 0) {
        const waitingTimeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
        sendToPlayer(ws, {
          type: MessageType.WAITING_NEXT,
          time: waitingTimeInfo
        });
      }
      // Değilse ve süre devam ediyorsa, süre güncellemesini başlat
      else if (timeInfo.remaining > 0) {
        // Süre güncellemesini hemen gönder
        sendToPlayer(ws, {
          type: MessageType.TIME_UPDATE,
          time: timeInfo
        });
        
        // Eğer interval yoksa başlat
        if (!gameState.timeUpdateInterval) {
          startTimeUpdateInterval();
        }
      }
    }
  } catch (error) {
    console.error('Connection handling error:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.terminate();
    }
    if (playerId) {
      handleDisconnect(playerId);
    }
  }
}

module.exports = {
  handleConnection,
  handleDisconnect
}; 