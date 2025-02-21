/**
 * Oyun ayarları
 */
module.exports = {
  ROUND_TIME: parseInt(process.env.ROUND_TIME) || 30000, // Bir sorunun cevaplanması için verilen süre (ms)
  NEXT_QUESTION_DELAY: parseInt(process.env.NEXT_QUESTION_DELAY) || 5000, // Yeni soruya geçmeden önceki bekleme süresi (ms)
  MAX_LIVES: parseInt(process.env.MAX_LIVES) || 3, // Oyuncunun başlangıçtaki can sayısı
  CORRECT_ANSWER_SCORE: parseInt(process.env.CORRECT_ANSWER_SCORE) || 10 // Doğru cevap için verilen puan
}; 