const { ROUND_TIME, NEXT_QUESTION_DELAY } = require('../config/game.config');

/**
 * Kalan soru süresini hesaplar
 * @param {number|null} lastQuestionTime Son sorunun başlangıç zamanı
 * @returns {Object} Süre bilgileri
 */
function getRemainingTime(lastQuestionTime) {
  if (!lastQuestionTime) return {
    total: ROUND_TIME,
    elapsed: 0,
    remaining: 0,
    percentage: 0
  };
  
  const elapsed = Date.now() - lastQuestionTime;
  const remaining = Math.max(0, ROUND_TIME - elapsed);
  
  return {
    total: ROUND_TIME,
    elapsed,
    remaining,
    percentage: Math.floor((elapsed / ROUND_TIME) * 100)
  };
}

/**
 * Kalan bekleme süresini hesaplar
 * @param {number|null} waitingStartTime Bekleme başlangıç zamanı
 * @returns {Object} Süre bilgileri
 */
function getRemainingWaitingTime(waitingStartTime) {
  if (!waitingStartTime) return {
    total: NEXT_QUESTION_DELAY,
    elapsed: 0,
    remaining: 0,
    percentage: 0
  };
  
  const elapsed = Date.now() - waitingStartTime;
  const remaining = Math.max(0, NEXT_QUESTION_DELAY - elapsed);
  
  return {
    total: NEXT_QUESTION_DELAY,
    elapsed,
    remaining,
    percentage: Math.floor((elapsed / NEXT_QUESTION_DELAY) * 100)
  };
}

module.exports = {
  getRemainingTime,
  getRemainingWaitingTime
}; 