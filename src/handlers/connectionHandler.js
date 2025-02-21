const WebSocket = require('ws');
const MessageType = require('../constants/messageTypes');
const Player = require('../models/Player');
const { getUserFromAPI } = require('../services/authService');
const { broadcast, sendToPlayer } = require('../utils/websocket');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const gameState = require('../state/gameState');
const { sendNewQuestion, startTimeUpdateInterval } = require('./gameHandler');

/**
 * Yeni bir WebSocket bağlantısını yönetir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {Object} req HTTP isteği
 */
async function handleConnection(wss, ws, req) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    sendToPlayer(ws, {
      type: MessageType.ERROR,
      message: 'Authentication required'
    });
    ws.close();
    return;
  }

  // Kullanıcı bilgilerini API'den al
  const userData = await getUserFromAPI(token);
  if (!userData) {
    sendToPlayer(ws, {
      type: MessageType.ERROR,
      message: 'Invalid token or user not found'
    });
    ws.close();
    return;
  }

  // Oyuncuyu oluştur
  const player = new Player(ws, userData);

  // Eğer mevcut round'da can durumu varsa onu kullan
  if (gameState.currentQuestion) {
    const roundKey = `${gameState.questionIndex}_${player.id}`;
    const roundLives = gameState.roundLives.get(roundKey);
    if (roundLives !== undefined) {
      player.lives = roundLives;
    }
  }

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
      totalQuestions: gameState.questions.length
    }
  });

  // İlk oyuncu bağlandığında oyunu başlat
  if (gameState.players.size === 1 && !gameState.currentQuestion) {
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

    // Eğer bekleme süresindeyse, bekleme süresini gönder
    if (gameState.waitingStartTime) {
      const waitingTimeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
      sendToPlayer(ws, {
        type: MessageType.WAITING_NEXT,
        time: waitingTimeInfo
      });
    }
    // Değilse ve süre devam ediyorsa, süre güncellemesini başlat
    else if (timeInfo.remaining > 0) {
      // Eğer interval yoksa başlat
      if (!gameState.timeUpdateInterval) {
        startTimeUpdateInterval();
      }
    }
  }

  // Bağlantı kapandığında
  ws.on('close', () => handleDisconnect(userData.id));
}

/**
 * Bağlantı kapandığında yapılacak işlemler
 * @param {string} playerId Oyuncu ID'si
 */
function handleDisconnect(playerId) {
  gameState.players.delete(playerId);
  
  if (gameState.players.size === 0) {
    // Tüm zamanlayıcıları temizle
    if (gameState.roundTimer) {
      clearInterval(gameState.roundTimer);
      gameState.roundTimer = null;
    }
    if (gameState.timeUpdateInterval) {
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
    }
  }
}

module.exports = {
  handleConnection,
  handleDisconnect
}; 