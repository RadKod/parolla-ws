const WebSocket = require('ws');

/**
 * Tüm bağlı istemcilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 * @param {Array<string>} [excludePlayerIds] Mesajı almayacak oyuncuların ID'leri
 * @param {boolean} [includeViewers=false] İzleyicilere de mesaj gönderilip gönderilmeyeceği
 */
function broadcast(wss, message, excludePlayerIds = [], includeViewers = false) {
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

module.exports = {
  broadcast,
  sendToPlayer,
  broadcastToViewers
}; 