const WebSocket = require('ws');
const MessageType = require('../constants/messageTypes');
const Player = require('../models/Player');

/**
 * Tüm bağlı istemcilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 * @param {Array<string>} [excludePlayerIds] Mesajı almayacak oyuncuların ID'leri
 * @param {boolean} [includeViewers=false] İzleyicilere de mesaj gönderilip gönderilmeyeceği
 * @param {boolean} [playerListChannel=false] Sadece player list channel'a gönderilecek mi
 */
function broadcast(wss, message, excludePlayerIds = [], includeViewers = false, playerListChannel = false) {
  if (!wss || !wss.clients) {
    console.error('Invalid WebSocket server or no clients');
    return;
  }

  try {
    const jsonMessage = JSON.stringify(message);
    const clients = Array.from(wss.clients);
    
    for (const client of clients) {
      try {
        if (client.readyState !== WebSocket.OPEN) {
          continue;
        }

        // Player list channel kontrolü
        if (playerListChannel) {
          // Sadece player list channel'a bağlı olanlara gönder
          if (client._playerListChannel) {
            client.send(jsonMessage);
          }
          continue;
        }

        // İzleyici kontrolü - sadece includeViewers true ise izleyicilere gönder
        if (client._isViewer) {
          if (includeViewers) {
            client.send(jsonMessage);
          }
          continue;
        }

        // Player ID kontrolü
        const playerId = client._playerId;
        if (!playerId || excludePlayerIds.includes(playerId)) {
          continue;
        }

        client.send(jsonMessage);
      } catch (error) {
        console.error('Error sending to client:', error);
        try {
          client.terminate();
        } catch (e) {
          console.error('Client termination error:', e);
        }
      }
    }
  } catch (error) {
    console.error('Broadcast error:', error);
  }
}

/**
 * Belirli bir oyuncuya mesaj gönderir
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {Object} message Gönderilecek mesaj
 */
function sendToPlayer(ws, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    const jsonMessage = JSON.stringify(message);
    ws.send(jsonMessage);
    return true;
  } catch (error) {
    console.error('Send to player error:', error.message);
    return false;
  }
}

/**
 * İzleyicilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 */
function broadcastToViewers(wss, message) {
  if (!wss || !wss.clients) return;

  wss.clients.forEach((client) => {
    // Sadece izleyicilere gönder
    if (client.readyState === WebSocket.OPEN && client._isViewer) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error('Broadcast to viewer error:', error.message);
      }
    }
  });
}

/**
 * Sistem mesajı oluşturur ve tüm oyunculara gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {string} message Sistem mesajı metni
 * @param {string} messageType Sistem mesajı tipi
 * @param {Array<string>} [excludePlayerIds] Mesajı almayacak oyuncuların ID'leri
 * @param {boolean} [addToChat=true] Mesajı chat geçmişine eklenip eklenmeyeceği
 */
function sendSystemMessage(wss, message, messageType, excludePlayerIds = [], addToChat = true) {
  if (!wss || !wss.clients) {
    console.error('Invalid WebSocket server or no clients');
    return;
  }

  try {
    const systemMessage = {
      type: MessageType.SYSTEM_MESSAGE,
      message: message,
      messageType: messageType,
      timestamp: Date.now(),
      isSystem: true
    };

    // Sistem mesajını gönder - her durumda anlık olarak gönderilir
    broadcast(wss, systemMessage, excludePlayerIds, true);

    // Chat mesajı olarak da gönder
    if (addToChat) {
      const chatMessage = {
        type: MessageType.CHAT_MESSAGE,
        playerId: 'system',
        playerName: 'Sistem',
        message: message,
        timestamp: Date.now(),
        isSystem: true
      };

      // Oyuncu giriş/çıkış mesajlarını geçmişe ekleme
      const skipMessageTypes = ['player_joined', 'player_left'];
      const shouldAddToHistory = !skipMessageTypes.includes(messageType);

      if (shouldAddToHistory) {
        // Chat geçmişine ekle
        const gameState = require('../state/gameState');
        if (gameState.chatHistory.length >= 100) {
          gameState.chatHistory.shift(); // En eski mesajı kaldır
        }
        gameState.chatHistory.push(chatMessage);
      }

      // Chat mesajını gönder - her durumda anlık olarak gönderilir
      broadcast(wss, chatMessage, excludePlayerIds, true);
    }
  } catch (error) {
    console.error('Send system message error:', error);
  }
}

module.exports = {
  broadcast,
  sendToPlayer,
  broadcastToViewers,
  sendSystemMessage
}; 
