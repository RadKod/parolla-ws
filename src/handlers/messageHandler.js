const MessageType = require('../constants/messageTypes');
const { sendToPlayer } = require('../utils/websocket');
const gameState = require('../state/gameState');
const { handleAnswer } = require('./gameHandler');
const { broadcast } = require('../utils/websocket');
const { ROUND_TIME } = require('../config/game.config');
const { addRecentAnswer } = require('../services/scoreService');

/**
 * WebSocket mesajlarını işler
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {string} message Ham mesaj verisi
 * @param {string} playerId Oyuncu ID'si
 */
function handleMessage(ws, message, playerId) {
  // İzleyici modundaki kullanıcılar mesaj gönderemez
  if (ws._isViewer) {
    sendToPlayer(ws, {
      type: MessageType.ERROR,
      message: 'İzleyici modunda mesaj gönderemezsiniz'
    });
    return;
  }

  let data;
  try {
    data = JSON.parse(message);
  } catch (error) {
    sendToPlayer(ws, {
      type: MessageType.ERROR,
      message: 'Invalid message format'
    });
    return;
  }

  const player = gameState.players.get(playerId);
  if (!player) {
    sendToPlayer(ws, {
      type: MessageType.ERROR,
      message: 'Player not found'
    });
    return;
  }

  switch (data.type) {
    case MessageType.ANSWER:
      if (!data.answer || typeof data.answer !== 'string') {
        sendToPlayer(ws, {
          type: MessageType.ERROR,
          message: 'Invalid answer format'
        });
        return;
      }
      
      console.log(`MessageHandler: ${player.name} cevap gönderdi: ${data.answer}`);
      
      // Cevabı işle
      handleAnswer(player, data.answer);
      
      // Tüm gerekli verileri manuel olarak hazırla
      const roundKey = `${gameState.questionIndex}_${player.id}`;
      const isCorrect = gameState.roundCorrectAnswers.get(roundKey) || false;
      const responseTime = gameState.playerTimes.get(roundKey) || 0;
      const attemptCount = gameState.playerAttempts.get(roundKey) || 1;
      
      // Son cevaplar listesini güncelle ve al
      const recentAnswers = addRecentAnswer(player, isCorrect, gameState.questionIndex, responseTime);
      
      // Son cevaplar listesini tüm oyunculara gönder
      broadcast(gameState.wss, {
        type: MessageType.RECENT_ANSWERS,
        answers: recentAnswers
      }, [], true);
      
      console.log(`MessageHandler: Recent Answers gönderildi (${recentAnswers.length} cevap)`);
      
      // Cevap sonucunu oyuncuya bildir
      sendToPlayer(ws, {
        type: MessageType.ANSWER_RESULT,
        correct: isCorrect,
        lives: player.lives,
        score: player.score,
        questionIndex: gameState.questionIndex,
        responseTime: responseTime,
        responseTimeSeconds: Math.floor(responseTime / 1000),
        attemptCount: attemptCount,
        timestamp: Date.now(),
        answerTimeDescription: `${Math.floor(responseTime / 1000)} saniyede cevaplandı`
      });
      
      console.log(`MessageHandler: Answer Result gönderildi -> correct: ${isCorrect}, lives: ${player.lives}, score: ${player.score}`);
      break;

    case MessageType.CHAT_MESSAGE:
      if (!data.message || typeof data.message !== 'string' || data.message.trim() === '') {
        sendToPlayer(ws, {
          type: MessageType.ERROR,
          message: 'Geçersiz mesaj formatı'
        });
        return;
      }
      
      // Mesajın maksimum uzunluğunu kontrol et
      if (data.message.length > 500) {
        sendToPlayer(ws, {
          type: MessageType.ERROR,
          message: 'Mesaj çok uzun (maksimum 500 karakter)'
        });
        return;
      }
      
      const chatMessage = {
        type: MessageType.CHAT_MESSAGE,
        playerId: playerId,
        playerName: player.name,
        message: data.message,
        timestamp: Date.now(),
        isSystem: false
      };
      
      // Mesajı chat geçmişine ekle
      if (!gameState.chatHistory) {
        gameState.chatHistory = [];
      }
      
      // Chat geçmişini sınırla (son 100 mesaj)
      if (gameState.chatHistory.length >= 100) {
        gameState.chatHistory.shift(); // En eski mesajı kaldır
      }
      
      gameState.chatHistory.push(chatMessage);
      
      // Tüm oyunculara ve izleyicilere mesajı gönder
      broadcast(gameState.wss, chatMessage, [], true);
      
      console.log(`Chat: ${player.name}: ${data.message}`);
      break;

    default:
      sendToPlayer(ws, {
        type: MessageType.ERROR,
        message: 'Unknown message type'
      });
  }
}

module.exports = {
  handleMessage
}; 