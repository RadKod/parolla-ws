const MessageType = require('../constants/messageTypes');
const { sendToPlayer } = require('../utils/websocket');
const gameState = require('../state/gameState');
const { handleAnswer } = require('./gameHandler');

/**
 * WebSocket mesajlarını işler
 * @param {WebSocket} ws WebSocket bağlantısı
 * @param {string} message Ham mesaj verisi
 * @param {string} playerId Oyuncu ID'si
 */
function handleMessage(ws, message, playerId) {
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