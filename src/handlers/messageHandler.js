const MessageType = require('../constants/messageTypes');
const { sendToPlayer } = require('../utils/websocket');
const gameState = require('../state/gameState');
const { handleAnswer } = require('./gameHandler');
const { broadcast } = require('../utils/websocket');

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
      handleAnswer(player, data.answer);
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
      
      // Debug bilgisi - kaç tane istemci var?
      const totalClients = gameState.wss?.clients?.size || 0;
      const activeClients = Array.from(gameState.wss?.clients || []).filter(c => c.readyState === 1).length;
      const viewers = Array.from(gameState.wss?.clients || []).filter(c => c._isViewer).length;
      const players = Array.from(gameState.wss?.clients || []).filter(c => !c._isViewer).length;
      
      console.log(`Chat Broadcast Info: 
        Total Clients: ${totalClients}, 
        Active: ${activeClients}, 
        Viewers: ${viewers}, 
        Players: ${players}`);
      
      // Tüm oyunculara ve izleyicilere mesajı gönder
      broadcast(gameState.wss, chatMessage, [], true);
      
      // Alternatif mesaj tipinde de gönder (v2)
      const chatMessageV2 = {
        ...chatMessage,
        type: MessageType.CHAT_MESSAGE_V2
      };
      broadcast(gameState.wss, chatMessageV2, [], true);
      
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