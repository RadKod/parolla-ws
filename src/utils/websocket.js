const WebSocket = require('ws');

/**
 * Tüm bağlı istemcilere mesaj gönderir
 * @param {WebSocket.Server} wss WebSocket sunucusu
 * @param {Object} message Gönderilecek mesaj
 */
function broadcast(wss, message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

/**
 * Belirli bir oyuncuya mesaj gönderir
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {Object} message Gönderilecek mesaj
 */
function sendToPlayer(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

module.exports = {
  broadcast,
  sendToPlayer
}; 