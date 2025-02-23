const { ROUND_TIME, MAX_LIVES } = require('../config/game.config');

/**
 * Oyun durumunu tutan state objesi
 */
const gameState = {
  // WebSocket sunucusu
  wss: null,

  // Oyuncular Map'i (playerId -> Player)
  players: new Map(),

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

  // Bekleme süresi için interval
  waitingInterval: null,

  // Oyun ayarları
  ROUND_TIME,
  MAX_LIVES
};

module.exports = gameState; 