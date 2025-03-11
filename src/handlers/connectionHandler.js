const WebSocket = require('ws');
const MessageType = require('../constants/messageTypes');
const Player = require('../models/Player');
const { getUserFromAPI } = require('../services/authService');
const { broadcast, sendToPlayer, broadcastToViewers, sendSystemMessage } = require('../utils/websocket');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const gameState = require('../state/gameState');
const { sendNewQuestion, startTimeUpdateInterval, handleUserJoin, handleUserLeave } = require('./gameHandler');
const { composePlayerEventLog, composeGameStatusLog } = require('../utils/logger');
const url = require('url');
const { getRecentAnswers } = require('../services/scoreService');

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

    // Oyuncunun mevcut durumunu kaydet
    const currentState = {
      lives: player.lives,
      score: player.score,
      is_permanent: player.is_permanent
    };

    // Log oluştur (oyuncu çıkmadan önce)
    const disconnectLog = composePlayerEventLog('leave', player);
    console.log('Player Disconnect:', JSON.stringify(disconnectLog, null, 2));

    // Oyuncuyu listeden kaldır
    gameState.players.delete(playerId);
    
    // Kullanıcı listesini güncelle ve broadcast et
    handleUserLeave(player);
    
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

      // Cleanup timeout'u temizle
      if (gameState.timeUpdateCleanupTimeout) {
        clearTimeout(gameState.timeUpdateCleanupTimeout);
        gameState.timeUpdateCleanupTimeout = null;
      }
      
      // Son oyuncu çıktığında oyun durumunu sıfırla
      gameState.waitingStartTime = null;
      gameState.lastQuestionTime = null;
      gameState.currentQuestion = null;
      gameState.questionIndex = 0;

      // Oyun durumu logu
      const gameStatus = composeGameStatusLog();
      console.log('Game Status (All Players Left):', JSON.stringify(gameStatus, null, 2));
    }

    // Diğer oyunculara bildir
    broadcast(gameState.wss, {
      type: MessageType.PLAYER_LEFT,
      playerId: playerId,
      isPlayerUpdate: true,
      player: {
        id: player.id,
        name: player.name,
        fingerprint: player.fingerprint,
        is_permanent: player.is_permanent,
        lives: player.lives,
        score: player.score
      },
      playerList: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        fingerprint: p.fingerprint,
        is_permanent: p.is_permanent,
        lives: p.lives,
        score: p.score,
        lastConnectionTime: p.lastConnectionTime,
        isOnline: p.ws.readyState === WebSocket.OPEN
      }))
    });

    // Sistem mesajını gönder
    sendSystemMessage(gameState.wss, `${player.name} oyundan ayrıldı`, 'player_left');
  } catch (error) {
    console.error('Disconnect handling error:', error);
  }
}

/**
 * İzleyici bağlantısı kapandığında yapılacak işlemler
 * @param {WebSocket} ws WebSocket bağlantısı
 */
function handleViewerDisconnect(ws) {
  try {
    // WebSocket bağlantısını kapat
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.terminate(); // force close
    }

    // İzleyici sayısını azalt
    if (gameState.viewerCount > 0) {
      gameState.viewerCount--;
    }

    console.log(`İzleyici ayrıldı. Toplam izleyici sayısı: ${gameState.viewerCount}`);
    
    // İzleyici sayısı değiştiğinde oyunculara bildir
    broadcast(gameState.wss, {
      type: MessageType.VIEWER_COUNT_UPDATE,
      viewerCount: gameState.viewerCount
    }, [], false);
  } catch (error) {
    console.error('Viewer disconnect handling error:', error);
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
  let player = null;

  try {
    // URL'den token parametresini al ve temizle
    const { query } = url.parse(req.url, true);
    const token = cleanToken(query.token);

    // Token yoksa veya "undefined" ise izleyici modunda bağlan
    if (!token || token === "undefined") {
      console.log('İzleyici bağlantısı: Token yok veya geçersiz');
      
      // İzleyici sayısını artır
      gameState.viewerCount = (gameState.viewerCount || 0) + 1;
      
      // İzleyici olduğunu belirt
      ws._isViewer = true;
      
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
        console.error('İzleyici bağlantı hatası:', error);
        clearInterval(pingInterval);
        handleViewerDisconnect(ws);
      });

      // Bağlantı kapandığında
      ws.on('close', () => {
        clearInterval(pingInterval);
        handleViewerDisconnect(ws);
      });

      console.log(`İzleyici bağlandı. Toplam izleyici sayısı: ${gameState.viewerCount}`);
      
      // İzleyici sayısı değiştiğinde oyunculara bildir
      broadcast(gameState.wss, {
        type: MessageType.VIEWER_COUNT_UPDATE,
        viewerCount: gameState.viewerCount
      }, [], false);

      // İzleyiciye hoş geldin mesajı gönder
      sendToPlayer(ws, {
        type: MessageType.CONNECTED,
        isViewer: true,
        message: 'İzleyici modunda bağlandınız. Sadece soruları görebilirsiniz, cevap veremezsiniz.',
        playerList: Array.from(gameState.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          fingerprint: p.fingerprint,
          is_permanent: p.is_permanent,
          lives: p.lives,
          score: p.score,
          lastConnectionTime: p.lastConnectionTime,
          isOnline: p.ws.readyState === WebSocket.OPEN
        })),
        gameInfo: {
          roundTime: gameState.ROUND_TIME,
          maxLives: gameState.MAX_LIVES,
          totalQuestions: gameState.questions.length,
          viewerCount: gameState.viewerCount
        },
        chatHistory: gameState.chatHistory || []
      });

      // Son cevaplar listesini gönder
      const recentAnswers = getRecentAnswers();
      if (recentAnswers.length > 0) {
        sendToPlayer(ws, {
          type: MessageType.RECENT_ANSWERS,
          answers: recentAnswers
        });
      }

      // Eğer mevcut bir soru varsa, izleyiciye gönder
      if (gameState.currentQuestion) {
        console.log('İzleyiciye mevcut soru gönderiliyor:', gameState.currentQuestion.id);
        
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
            viewerCount: gameState.viewerCount
          }
        });

        // Kalan süreyi hesapla ve gönder
        const timeInfo = getRemainingTime(gameState.lastQuestionTime);
        if (timeInfo.remaining > 0) {
          console.log('İzleyiciye kalan süre gönderiliyor:', timeInfo.remaining);
          
          sendToPlayer(ws, {
            type: MessageType.TIME_UPDATE,
            time: timeInfo
          });
        }
        // Eğer bekleme süresindeyse
        else if (gameState.waitingStartTime) {
          console.log('İzleyiciye bekleme süresi gönderiliyor');
          
          const waitingTimeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
          sendToPlayer(ws, {
            type: MessageType.WAITING_NEXT,
            time: waitingTimeInfo
          });
        }
      } else {
        console.log('Mevcut soru yok, izleyici beklemede');
      }
      
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

      // Önceki oyuncunun durumunu koru
      const previousState = {
        lives: existingPlayer.lives,
        score: existingPlayer.score,
        is_permanent: existingPlayer.is_permanent
      };

      // Oyuncu puanlarını sakla
      const playerScoreData = gameState.playerScores.get(userData.id);

      // Oyuncu listesinden kaldır
      gameState.players.delete(userData.id);
      
      // Kapanmanın tamamlanmasını bekle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Yeni oyuncuyu önceki durumuyla oluştur
      player = new Player(ws, {
        ...userData,
        is_permanent: previousState.is_permanent
      });
      
      // Önceki durumu geri yükle
      player.lives = previousState.lives;
      player.score = previousState.score;
      
      // Eğer kayıtlı skor verisi varsa, yeni bağlantıda da kullan
      if (playerScoreData) {
        gameState.playerScores.set(userData.id, playerScoreData);
      }
    } else {
      // Yeni oyuncuyu oluştur
      player = new Player(ws, userData);

      // Eğer mevcut round'da can durumu varsa onu kullan
      if (gameState.currentQuestion) {
        const roundKey = `${gameState.questionIndex}_${playerId}`;
        const roundLives = gameState.roundLives.get(roundKey);
        if (roundLives !== undefined) {
          player.lives = roundLives;
        }
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

    // Kullanıcı listesini güncelle ve broadcast et
    handleUserJoin(player);
    
    // Bağlantı logu
    const connectLog = composePlayerEventLog('join', player);
    console.log('Player Connect:', JSON.stringify(connectLog, null, 2));

    // Oyun durumu logu
    const gameStatus = composeGameStatusLog();
    console.log('Game Status:', JSON.stringify(gameStatus, null, 2));

    // Diğer oyunculara bildir
    broadcast(gameState.wss, {
      type: MessageType.PLAYER_JOINED,
      playerId: playerId,
      isPlayerUpdate: true,
      player: {
        id: player.id,
        name: player.name,
        fingerprint: player.fingerprint,
        is_permanent: player.is_permanent,
        lives: player.lives,
        score: player.score
      },
      playerList: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        fingerprint: p.fingerprint,
        is_permanent: p.is_permanent,
        lives: p.lives,
        score: p.score,
        lastConnectionTime: p.lastConnectionTime,
        isOnline: p.ws.readyState === WebSocket.OPEN
      }))
    });

    // Sistem mesajını gönder
    sendSystemMessage(gameState.wss, `${player.name} oyuna katıldı`, 'player_joined', [player.id]);

    // Socket'e bağlantı başarılı bilgisini gönder
    sendToPlayer(player.ws, {
      type: MessageType.CONNECTED,
      message: 'Successfully connected',
      playerId: player.id,
      player: {
        id: player.id,
        name: player.name,
        fingerprint: player.fingerprint,
        is_permanent: player.is_permanent,
        lives: player.lives,
        score: player.score,
        lastConnectionTime: player.lastConnectionTime
      },
      playerList: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        fingerprint: p.fingerprint,
        is_permanent: p.is_permanent,
        lives: p.lives,
        score: p.score,
        lastConnectionTime: p.lastConnectionTime,
        isOnline: p.ws.readyState === WebSocket.OPEN
      })),
      gameInfo: {
        roundTime: gameState.ROUND_TIME,
        maxLives: gameState.MAX_LIVES,
        totalQuestions: gameState.questions.length,
        viewerCount: gameState.viewerCount
      },
      chatHistory: gameState.chatHistory || []
    });

    // Son cevaplar listesini gönder
    const recentAnswers = getRecentAnswers();
    if (recentAnswers.length > 0) {
      sendToPlayer(player.ws, {
        type: MessageType.RECENT_ANSWERS,
        answers: recentAnswers
      });
    }

    // Hoş geldin mesajını gönder
    sendToPlayer(ws, {
      type: MessageType.SYSTEM_MESSAGE,
      message: `Oyuna hoş geldin ${player.name}!`,
      messageType: 'welcome'
    });

    // Eğer mevcut bir soru varsa, yeni oyuncuya gönder
    if (gameState.currentQuestion) {
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
          timestamp: gameState.lastQuestionTime
        }
      });

      // Kalan süreyi hesapla ve gönder
      const timeInfo = getRemainingTime(gameState.lastQuestionTime);
      if (timeInfo.remaining > 0) {
        sendToPlayer(ws, {
          type: MessageType.TIME_UPDATE,
          time: timeInfo
        });
      }
      // Eğer bekleme süresindeyse
      else if (gameState.waitingStartTime) {
        const waitingTimeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
        sendToPlayer(ws, {
          type: MessageType.WAITING_NEXT,
          time: waitingTimeInfo
        });
      }
    }
    // Eğer mevcut soru yoksa ve oyuncular varsa, yeni soru gönder
    else if (gameState.players.size > 0) {
      // Yeni soru gönder
      sendNewQuestion();
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