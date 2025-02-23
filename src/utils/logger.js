const gameState = require('../state/gameState');

/**
 * Oyun durumunu loglar
 * @returns {string} Durum mesajı
 */
function composeGameStatusLog() {
  const now = new Date().toISOString();
  const playerCount = gameState.players.size;
  const activePlayers = Array.from(gameState.players.values()).filter(p => p.ws.readyState === 1).length;
  const currentQuestionIndex = gameState.questionIndex + 1;
  const totalQuestions = gameState.questions.length;
  
  let gamePhase = 'beklemede';
  if (gameState.currentQuestion) {
    if (gameState.waitingStartTime) {
      gamePhase = 'sonraki_soru_bekleniyor';
    } else {
      gamePhase = 'soru_aktif';
    }
  }

  const players = Array.from(gameState.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    lives: p.lives,
    score: p.score,
    isOnline: p.ws.readyState === 1,
    lastConnection: new Date(p.lastConnectionTime).toISOString()
  }));

  return {
    timestamp: now,
    status: {
      totalPlayers: playerCount,
      activePlayers,
      phase: gamePhase,
      questionStatus: gameState.currentQuestion ? {
        currentQuestion: currentQuestionIndex,
        totalQuestions,
        questionId: gameState.currentQuestion.id
      } : null
    },
    players: players
  };
}

/**
 * Oyuncu giriş/çıkış logları
 * @param {string} type Olay tipi ('join' veya 'leave')
 * @param {Object} player Oyuncu objesi
 * @returns {string} Log mesajı
 */
function composePlayerEventLog(type, player) {
  const now = new Date().toISOString();
  const totalPlayers = gameState.players.size;
  
  return {
    timestamp: now,
    event: type === 'join' ? 'player_joined' : 'player_left',
    player: {
      id: player.id,
      name: player.name
    },
    totalPlayers,
    activePlayers: Array.from(gameState.players.values()).filter(p => p.ws.readyState === 1).length
  };
}

/**
 * Oyun akışı logları
 * @param {string} event Olay tipi
 * @param {Object} data İlgili veri
 * @returns {string} Log mesajı
 */
function composeGameEventLog(event, data = {}) {
  const now = new Date().toISOString();
  
  return {
    timestamp: now,
    event,
    ...data,
    playerCount: gameState.players.size,
    activePlayers: Array.from(gameState.players.values()).filter(p => p.ws.readyState === 1).length
  };
}

module.exports = {
  composeGameStatusLog,
  composePlayerEventLog,
  composeGameEventLog
}; 