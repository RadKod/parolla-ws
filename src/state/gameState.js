const { ROUND_TIME, MAX_LIVES } = require('../config/game.config');

/**
 * Oyuncu listesi yönetimi için yardımcı fonksiyonlar
 */
const playerManagement = {
  // Aktif oyuncuları sırala (son bağlantı zamanına göre)
  getSortedPlayers() {
    return Array.from(gameState.players.values())
      .sort((a, b) => b.lastConnectionTime - a.lastConnectionTime);
  },

  // Oyuncu sayısını al
  getPlayerCount() {
    return gameState.players.size;
  },

  // Aktif oyuncuları al
  getActivePlayers() {
    return Array.from(gameState.players.values())
      .filter(p => p.ws.readyState === 1); // WebSocket.OPEN = 1
  },

  // Oyuncuyu güncelle
  updatePlayer(playerId, updates) {
    const player = gameState.players.get(playerId);
    if (player) {
      Object.assign(player, updates);
      return true;
    }
    return false;
  }
};

/**
 * Oyun durumunu tutan state objesi
 */
const gameState = {
  // WebSocket sunucusu
  wss: null,

  // Oyuncular Map'i (playerId -> Player)
  players: new Map(),

  // İzleyici sayısı
  viewerCount: 0,

  // Round bazlı can durumları (roundIndex_playerId -> lives)
  roundLives: new Map(),

  // Round bazlı doğru cevaplar (roundIndex_playerId -> boolean)
  roundCorrectAnswers: new Map(),

  // Sorular listesi
  questions: [],

  // Mevcut soru indexi
  questionIndex: 0,

  // Mevcut soru
  currentQuestion: null,

  // Son sorunun gönderilme zamanı
  lastQuestionTime: null,

  // Bekleme süresinin başlangıç zamanı
  waitingStartTime: null,

  // Soru süresi için timer
  roundTimer: null,

  // Süre güncellemesi için interval
  timeUpdateInterval: null,

  // Chat mesaj geçmişi
  chatHistory: [],

  // Puanlama sistemi için alanlar
  correctAnswerPlayers: [], // Her turda doğru cevap veren oyuncuların listesi
  playerTimes: new Map(), // Oyuncuların cevap süreleri (roundIndex_playerId -> responseTime ms)
  playerAttempts: new Map(), // Oyuncuların cevap hakları (roundIndex_playerId -> attemptCount)
  playerScores: new Map(), // Oyuncuların puanları (playerId -> scoreObject)

  // Oyun ayarları
  ROUND_TIME,
  MAX_LIVES,

  // Oyuncu yönetimi fonksiyonları
  playerManagement
};

module.exports = gameState; 