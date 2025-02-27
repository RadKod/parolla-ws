const WebSocket = require('ws');
const MessageType = require('../constants/messageTypes');

/**
 * Tüm bağlı istemcilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 * @param {Array<string>} [excludePlayerIds] Mesajı almayacak oyuncuların ID'leri
 * @param {boolean} [includeViewers=false] İzleyicilere de mesaj gönderilip gönderilmeyeceği
 */
function broadcast(wss, message, excludePlayerIds = [], includeViewers = false) {
  if (!wss || !wss.clients) {
    console.error('Invalid WebSocket server or no clients:', wss?.clients?.size);
    return;
  }

  try {
    const jsonMessage = JSON.stringify(message);
    const clients = Array.from(wss.clients);
    let sentCount = 0;
    let viewerSentCount = 0;
    let playerSentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let notOpenCount = 0;
    let excludedCount = 0;
    
    for (const client of clients) {
      try {
        if (client.readyState !== WebSocket.OPEN) {
          notOpenCount++;
          continue;
        }

        // İzleyici kontrolü - sadece includeViewers true ise izleyicilere gönder
        if (client._isViewer) {
          if (includeViewers) {
            client.send(jsonMessage);
            sentCount++;
            viewerSentCount++;
          } else {
            skippedCount++;
          }
          continue;
        }

        // Player ID kontrolü
        const playerId = client._playerId;
        if (!playerId || excludePlayerIds.includes(playerId)) {
          excludedCount++;
          continue;
        }

        client.send(jsonMessage);
        sentCount++;
        playerSentCount++;
      } catch (error) {
        errorCount++;
        console.error('Error sending to client:', error);
        try {
          client.terminate();
        } catch (e) {
          console.error('Client termination error:', e);
        }
      }
    }
    
    // Debug bilgisi - kaç istemciye mesaj gönderildi
    if (message.type === 'chat_message' || message.type === 'chat_message_v2') {
      console.log(`Broadcast details for ${message.type}:
        - Total clients: ${clients.length}
        - Messages sent: ${sentCount} (${playerSentCount} players, ${viewerSentCount} viewers)
        - Skipped (viewer mode): ${skippedCount}
        - Not open connections: ${notOpenCount}
        - Excluded players: ${excludedCount}
        - Errors: ${errorCount}
        - Message content: ${message.message && message.message.length > 100 ? message.message.substring(0, 100) + '...' : message.message}
      `);
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
  if (!ws) {
    console.error('Invalid WebSocket connection');
    return;
  }

  try {
    if (ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not open');
      return;
    }

    const jsonMessage = JSON.stringify(message);
    ws.send(jsonMessage);
  } catch (error) {
    console.error('SendToPlayer error:', error);
    try {
      ws.terminate();
    } catch (e) {
      console.error('Client termination error:', e);
    }
  }
}

/**
 * Sadece izleyicilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 */
function broadcastToViewers(wss, message) {
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

        // Sadece izleyicilere gönder
        if (client._isViewer) {
          client.send(jsonMessage);
        }
      } catch (error) {
        console.error('Error sending to viewer:', error);
        try {
          client.terminate();
        } catch (e) {
          console.error('Client termination error:', e);
        }
      }
    }
  } catch (error) {
    console.error('Broadcast to viewers error:', error);
  }
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

      // Chat geçmişine ekle
      const gameState = require('../state/gameState');
      if (gameState.chatHistory.length >= 100) {
        gameState.chatHistory.shift(); // En eski mesajı kaldır
      }
      gameState.chatHistory.push(chatMessage);

      // Chat mesajını gönder
      broadcast(wss, chatMessage, excludePlayerIds, true);
    }

    // Sistem mesajını gönder
    broadcast(wss, systemMessage, excludePlayerIds, true);
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