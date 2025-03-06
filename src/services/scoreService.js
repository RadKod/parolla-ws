const gameState = require('../state/gameState');
const { 
  MAX_SCORE_PLAYERS, 
  BASE_SCORES, 
  TIME_BONUS_FACTOR, 
  ATTEMPT_PENALTY_FACTOR,
  MAX_LIVES,
  ROUND_TIME
} = require('../config/game.config');

/**
 * Oyuncuya bu turdaki puanını hesaplar ve kaydeder
 * @param {string} playerId Oyuncu ID'si
 * @param {number} responseTime Cevap süresi (ms)
 * @param {number} attemptCount Deneme sayısı 
 * @param {number} roundIndex Tur indeksi
 * @returns {Object} Puan bilgileri
 */
function calculatePlayerScore(playerId, responseTime, attemptCount, roundIndex) {
  // Doğru cevap verenlerin sırasını al (en hızlıdan en yavaşa doğru)
  const playerRank = gameState.correctAnswerPlayers.findIndex(pid => pid === playerId);
  
  // Eğer oyuncu doğru cevap vermemişse veya sıralama dışındaysa 0 puan döndür
  if (playerRank === -1 || playerRank >= MAX_SCORE_PLAYERS) {
    return {
      baseScore: 0,
      timeBonus: 0, 
      attemptPenalty: 0,
      totalScore: 0,
      rank: playerRank !== -1 ? playerRank + 1 : -1
    };
  }
  
  // Baz puanı belirle (sıralamaya göre)
  const baseScore = BASE_SCORES[playerRank] || 0;
  
  // Zaman bonusu hesapla
  // Kalan süre oranını bul (0-1 arası)
  const timeRatio = (ROUND_TIME - responseTime) / ROUND_TIME;
  const timeBonus = Math.round(baseScore * TIME_BONUS_FACTOR * timeRatio);
  
  // Hak cezası hesapla (kullanılan hak sayısı - 1) * ceza faktörü
  const usedAttempts = Math.max(0, attemptCount - 1); // İlk hak bedava
  const attemptPenalty = Math.round(baseScore * ATTEMPT_PENALTY_FACTOR * usedAttempts);
  
  // Toplam puanı hesapla
  const totalScore = Math.max(0, baseScore + timeBonus - attemptPenalty);
  
  // Puan nesnesini döndür
  return {
    baseScore,
    timeBonus,
    attemptPenalty,
    totalScore,
    rank: playerRank + 1
  };
}

/**
 * Tur sonunda puanları hesaplar ve günceller
 * @param {number} roundIndex Tur indeksi
 */
function calculateRoundScores(roundIndex) {
  const roundScores = [];
  
  // Her doğru cevap veren oyuncu için puanları hesapla
  for (const playerId of gameState.correctAnswerPlayers) {
    const roundKey = `${roundIndex}_${playerId}`;
    const player = gameState.players.get(playerId);
    
    if (!player) continue;
    
    // Oyuncunun yanıt süresini ve deneme sayısını al
    const responseTime = gameState.playerTimes.get(roundKey) || 0;
    const attemptCount = gameState.playerAttempts.get(roundKey) || 1;
    
    // Puanı hesapla
    const scoreInfo = calculatePlayerScore(playerId, responseTime, attemptCount, roundIndex);
    
    // Oyuncunun toplam puanını güncelle
    let playerScoreData = gameState.playerScores.get(playerId) || { 
      totalScore: 0, 
      rounds: {},
      answerResults: [] // cevap sonuçları listesi
    };
    
    playerScoreData.rounds[roundIndex] = scoreInfo;
    playerScoreData.totalScore += scoreInfo.totalScore;
    
    // Eğer answerResults dizisi yoksa oluştur
    if (!playerScoreData.answerResults) {
      playerScoreData.answerResults = [];
    }
    
    // AnswerResult sonuçlarında son cevap skorunu kontrol et
    const lastAnswerResult = playerScoreData.answerResults.find(
      ar => ar.questionIndex === roundIndex
    );
    
    // Eğer bulunamadıysa, yeni bir answerResult kaydı ekle
    if (!lastAnswerResult) {
      playerScoreData.answerResults.push({
        questionIndex: roundIndex,
        score: player.score,
        responseTime: responseTime,
        timestamp: Date.now()
      });
    }
    
    gameState.playerScores.set(playerId, playerScoreData);
    
    // Tur puanı listesine ekle
    roundScores.push({
      playerId,
      playerName: player.name,
      ...scoreInfo,
      totalPlayerScore: playerScoreData.totalScore,
      currentScore: player.score // mevcut ANSWER_RESULT skoru
    });
  }
  
  // Puanları sıralama düzenine göre sırala (rank)
  roundScores.sort((a, b) => a.rank - b.rank);
  
  return roundScores;
}

/**
 * Tüm oyuncuların toplam puanlarını alır
 * @returns {Array} Sıralanmış puan listesi
 */
function getGameScores() {
  const scores = [];
  
  // Tüm oyuncuların puanlarını hesapla
  for (const [playerId, player] of gameState.players) {
    const playerScore = gameState.playerScores.get(playerId);
    
    if (!playerScore) continue;
    
    scores.push({
      playerId,
      playerName: player.name,
      totalScore: playerScore.totalScore,
      roundScores: playerScore.rounds,
      answerHistory: playerScore.answerResults || [], // cevap geçmişi
      lastScore: player.score // mevcut oyuncu skoru
    });
  }
  
  // Puanlara göre sırala (büyükten küçüğe)
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  return scores;
}

/**
 * Son cevap listesine yeni cevap ekler
 * @param {Object} player Oyuncu bilgisi
 * @param {boolean} isCorrect Cevabın doğru olup olmadığı
 * @param {number} questionIndex Soru indeksi
 */
function addRecentAnswer(player, isCorrect, questionIndex) {
  // Yeni cevap bilgisi
  const recentAnswer = {
    playerId: player.id,
    playerName: player.name,
    isCorrect,
    questionIndex,
    totalScore: player.score,
    timestamp: Date.now()
  };
  
  // Eğer liste henüz oluşturulmamışsa oluştur
  if (!gameState.recentAnswers) {
    gameState.recentAnswers = [];
  }
  
  // Son cevaplar listesinin başına ekle (en yeni en üstte)
  gameState.recentAnswers.unshift(recentAnswer);
  
  // Maksimum 50 cevap tutulacak (tek bir soru için)
  if (gameState.recentAnswers.length > 50) {
    gameState.recentAnswers = gameState.recentAnswers.slice(0, 50); // Sadece ilk 50 cevabı tut
  }
  
  return gameState.recentAnswers;
}

/**
 * Son cevaplar listesini döndürür
 * @param {number} limit Döndürülecek maksimum cevap sayısı
 * @returns {Array} Son cevaplar listesi
 */
function getRecentAnswers(limit = 50) {
  // Listenin başından belirtilen limit kadar cevabı döndür
  return gameState.recentAnswers ? gameState.recentAnswers.slice(0, limit) : [];
}

/**
 * Yeni bir tur başladığında puanlama sistemini sıfırlar
 */
function resetRoundScoring() {
  gameState.correctAnswerPlayers = [];
  // Not: playerTimes ve playerAttempts haritaları sıfırlanmaz çünkü round_index eklenerek saklanıyor
}

module.exports = {
  calculatePlayerScore,
  calculateRoundScores,
  getGameScores,
  resetRoundScoring,
  addRecentAnswer,
  getRecentAnswers
}; 