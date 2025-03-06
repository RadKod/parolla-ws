/**
 * Oyun ayarları
 */
module.exports = {
  ROUND_TIME: parseInt(process.env.ROUND_TIME) || 30000, // Bir sorunun cevaplanması için verilen süre (ms)
  NEXT_QUESTION_DELAY: parseInt(process.env.NEXT_QUESTION_DELAY) || 5000, // Yeni soruya geçmeden önceki bekleme süresi (ms)
  MAX_LIVES: parseInt(process.env.MAX_LIVES) || 3, // Oyuncunun başlangıçtaki can sayısı
  CORRECT_ANSWER_SCORE: parseInt(process.env.CORRECT_ANSWER_SCORE) || 10, // Doğru cevap için verilen puan
  
  // Puanlama sistemi yapılandırması
  MAX_SCORE_PLAYERS: parseInt(process.env.MAX_SCORE_PLAYERS) || 10, // Puan alabilecek maksimum oyuncu sayısı
  BASE_SCORES: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], // Sıralamaya göre verilecek baz puanlar
  TIME_BONUS_FACTOR: 0.2, // Zaman bonusu faktörü
  ATTEMPT_PENALTY_FACTOR: 0.3 // Hak kullanımı ceza faktörü
}; 