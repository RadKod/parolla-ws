const MessageType = require('../constants/messageTypes');
const Player = require('../models/Player');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const gameState = require('../state/gameState');
const { sendNewQuestion } = require('./gameHandler');

/**
 * Bağlantı kapandığında yapılacak işlemler
 * @param {string} playerId Oyuncu ID'si
 */
function handleDisconnect(playerId) {
  try {
    const player = gameState.players.get(playerId);
    if (!player) return;

    // Oyuncuyu listeden kaldır
    gameState.players.delete(playerId);
    
    // Eğer hiç oyuncu kalmadıysa oyunu sıfırla
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
      // Oyun durumunu sıfırla
      gameState.currentQuestion = null;
      gameState.lastQuestionTime = null;
      gameState.waitingStartTime = null;
      gameState.questionIndex = 0;
    }

    // Diğer oyunculara bildir
    gameState.io.emit('message', {
      type: MessageType.PLAYER_LEFT,
      playerId: playerId
    });
  } catch (error) {
    console.error('Disconnect handling error:', error);
  }
}

/**
 * Yeni bir Socket.IO bağlantısını yönetir
 * @param {Server} io Socket.IO sunucusu
 * @param {Socket} socket Socket.IO bağlantısı
 */
async function handleConnection(io, socket) {
  try {
    const userData = socket.userData;
    const playerId = userData.id;

    // Eğer aynı kullanıcının önceki bağlantısı varsa kapat
    const existingPlayer = gameState.players.get(playerId);
    if (existingPlayer) {
      // Önceki bağlantıyı kapat
      existingPlayer.socket.disconnect(true);
      // Oyuncu listesinden kaldır
      gameState.players.delete(playerId);
      // Kapanmanın tamamlanmasını bekle
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Oyuncuyu oluştur
    const player = new Player(socket, userData);

    // Eğer mevcut round'da can durumu varsa onu kullan
    if (gameState.currentQuestion) {
      const roundKey = `${gameState.questionIndex}_${playerId}`;
      const roundLives = gameState.roundLives.get(roundKey);
      if (roundLives !== undefined) {
        player.lives = roundLives;
      }
    }

    // Bağlantı kapandığında
    socket.on('disconnect', () => {
      handleDisconnect(playerId);
    });

    // Oyuncuyu kaydet
    gameState.players.set(playerId, player);

    // Oyuncuya bilgilerini gönder
    socket.emit('message', {
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
    socket.broadcast.emit('message', {
      type: MessageType.PLAYER_JOINED,
      player: {
        id: player.id,
        name: player.name,
        fingerprint: player.fingerprint,
        is_permanent: player.is_permanent,
        lives: player.lives,
        score: player.score
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
      socket.emit('message', {
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
        socket.emit('message', {
          type: MessageType.WAITING_NEXT,
          time: waitingTimeInfo
        });
      }
      // Değilse ve süre devam ediyorsa, süre güncellemesini gönder
      else if (timeInfo.remaining > 0) {
        socket.emit('message', {
          type: MessageType.TIME_UPDATE,
          time: timeInfo
        });
      }
    }
  } catch (error) {
    console.error('Connection handling error:', error);
    socket.disconnect(true);
  }
}

module.exports = {
  handleConnection,
  handleDisconnect
}; 