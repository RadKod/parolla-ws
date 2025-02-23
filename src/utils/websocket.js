const WebSocket = require('ws');

/**
 * Tüm bağlı istemcilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 * @param {Array<string>} [excludePlayerIds] Mesajı almayacak oyuncuların ID'leri
 */
function broadcast(wss, message, excludePlayerIds = []) {
  const jsonMessage = JSON.stringify(message);
  
  wss.clients.forEach(client => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        // Player ID kontrolü
        const playerId = client._playerId; // WebSocket nesnesine eklediğimiz özel alan
        
        // Eğer client exclude listesinde değilse mesajı gönder
        if (!excludePlayerIds.includes(playerId)) {
          client.send(jsonMessage);
        }
      }
    } catch (error) {
      console.error('Broadcast error:', error);
      // Hatalı client'ı kapat
      try {
        client.terminate();
      } catch (e) {
        console.error('Client termination error:', e);
      }
    }
  });
}

/**
 * Belirli bir oyuncuya mesaj gönderir
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {Object} message Gönderilecek mesaj
 */
function sendToPlayer(ws, message) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  } catch (error) {
    console.error('SendToPlayer error:', error);
    // Hatalı bağlantıyı kapat
    try {
      ws.terminate();
    } catch (e) {
      console.error('Client termination error:', e);
    }
  }
}

module.exports = {
  broadcast,
  sendToPlayer
}; 