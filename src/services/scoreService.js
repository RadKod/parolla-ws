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
      attemptPenalty: 0,  // Ceza yok
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
  
  // Deneme sayısı bilgisini kaydet, ancak ceza uygulamıyoruz
  const usedAttempts = Math.max(0, attemptCount - 1); // İlk hak bedava
  // const attemptPenalty = Math.round(baseScore * ATTEMPT_PENALTY_FACTOR * usedAttempts);
  const attemptPenalty = 0; // Ceza yok
  
  // Toplam puanı hesapla (ceza olmadan)
  const totalScore = Math.max(0, baseScore + timeBonus);
  
  // Puan nesnesini döndür
  return {
    baseScore,
    timeBonus,
    attemptPenalty,
    totalScore,
    rank: playerRank + 1,
    attemptCount // Deneme sayısını da kaydedelim (istatistik için)
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
    
    // Eski skor bilgisini kaydet
    const oldScore = player.score;
    
    // Tur için yeni puanı ekle
    playerScoreData.rounds[roundIndex] = scoreInfo;
    
    // Toplam puana tur puanını ekle
    playerScoreData.totalScore += scoreInfo.totalScore;
    
    // Oyuncunun gerçek skorunu güncelle - ÖNEMLİ!
    player.score = playerScoreData.totalScore;
    
    // Eğer answerResults dizisi yoksa oluştur
    if (!playerScoreData.answerResults) {
      playerScoreData.answerResults = [];
    }
    
    // AnswerResult sonuçlarında son cevap skorunu kontrol et
    const lastAnswerResult = playerScoreData.answerResults.find(
      ar => ar.questionIndex === roundIndex
    );
    
    // Zaman damgasını al (ya mevcut kayıttan ya da şu anki zamanı kullan)
    const answerTimestamp = lastAnswerResult?.timestamp || Date.now();
    
    // Eğer bulunamadıysa, yeni bir answerResult kaydı ekle
    if (!lastAnswerResult) {
      playerScoreData.answerResults.push({
        questionIndex: roundIndex,
        score: player.score, // Güncellenmiş skoru kullan
        oldScore: oldScore, // Eski skoru da kaydedelim (istatistik için)
        earnedPoints: scoreInfo.totalScore, // Bu turda kazanılan puanlar
        responseTime: responseTime,
        responseTimeSeconds: Math.floor(responseTime / 1000), // Saniye cinsinden
        timestamp: answerTimestamp
      });
    } else {
      // Varolan kaydı güncelle
      lastAnswerResult.score = player.score;
      lastAnswerResult.oldScore = oldScore;
      lastAnswerResult.earnedPoints = scoreInfo.totalScore;
    }
    
    gameState.playerScores.set(playerId, playerScoreData);
    
    // Tur puanı listesine ekle
    roundScores.push({
      playerId,
      playerName: player.name,
      ...scoreInfo,
      responseTime,                  // Cevap süresi (ms)
      responseTimeSeconds: Math.floor(responseTime / 1000), // Saniye cinsinden
      timestamp: answerTimestamp,    // Zaman damgası
      attemptCount,                  // Deneme sayısı
      oldScore: oldScore,            // Eski skor
      newScore: player.score,        // Yeni skor  
      earnedPoints: scoreInfo.totalScore, // Bu turda kazanılan puanlar
      totalPlayerScore: playerScoreData.totalScore // Toplam puanı (aynı değer, newScore ile)
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
    
    // Her oyuncunun son cevabını ve süre bilgilerini bulalım
    const lastAnswer = playerScore.answerResults && playerScore.answerResults.length > 0 
      ? playerScore.answerResults[playerScore.answerResults.length - 1] 
      : null;
    
    scores.push({
      playerId,
      playerName: player.name,
      totalScore: playerScore.totalScore,
      roundScores: playerScore.rounds,
      answerHistory: playerScore.answerResults || [], // cevap geçmişi
      lastScore: player.score, // mevcut oyuncu skoru
      // Son cevap bilgileri
      lastResponseTime: lastAnswer?.responseTime || null,
      lastTimestamp: lastAnswer?.timestamp || null,
      avgResponseTime: calculateAverageResponseTime(playerScore.answerResults)
    });
  }
  
  // Puanlara göre sırala (büyükten küçüğe)
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  return scores;
}

/**
 * Oyuncunun ortalama cevap süresini hesaplar
 * @private
 * @param {Array} answerResults Cevap sonuçları dizisi
 * @returns {number|null} Ortalama cevap süresi (ms) veya null
 */
function calculateAverageResponseTime(answerResults) {
  if (!answerResults || answerResults.length === 0) {
    return null;
  }
  
  // Sadece responseTime değeri olan sonuçları filtrele
  const validResults = answerResults.filter(result => result.responseTime !== undefined && result.responseTime !== null);
  
  if (validResults.length === 0) {
    return null;
  }
  
  // Ortalama süreyi hesapla
  const totalTime = validResults.reduce((sum, result) => sum + result.responseTime, 0);
  return Math.round(totalTime / validResults.length);
}

/**
 * Son cevap listesine yeni cevap ekler
 * @param {Object} player Oyuncu bilgisi
 * @param {boolean} isCorrect Cevabın doğru olup olmadığı
 * @param {number} questionIndex Soru indeksi
 * @param {number} responseTime Round başlangıcından itibaren geçen süre (ms)
 */
function addRecentAnswer(player, isCorrect, questionIndex, responseTime = null) {
  // Eğer responseTime belirtilmemişse hesapla
  const roundKey = `${questionIndex}_${player.id}`;
  const actualResponseTime = responseTime !== null ? responseTime : 
    (gameState.playerTimes.get(roundKey) || 0);
  
  // Oyuncunun en güncel skor verisini al
  const playerScoreData = gameState.playerScores.get(player.id);
  
  // Eğer doğru cevap verdiyse, tahmini puanı hesapla
  let estimatedScore = 0;
  if (isCorrect) {
    // Şu anki sıralamayı bul (o ana kadar doğru cevap verenler arasında)
    const currentRank = gameState.correctAnswerPlayers.findIndex(pid => pid === player.id);
    
    // Eğer sıralama içindeyse ve puan alabilecek sıradaysa
    if (currentRank !== -1 && currentRank < MAX_SCORE_PLAYERS) {
      // Baz puanı hesapla
      estimatedScore = BASE_SCORES[currentRank] || 0;
      
      // Zaman bonusunu hesapla
      const timeRatio = (ROUND_TIME - actualResponseTime) / ROUND_TIME;
      const timeBonus = Math.round(estimatedScore * TIME_BONUS_FACTOR * timeRatio);
      
      // Toplam tahmini puanı hesapla (deneme cezası olmadan)
      estimatedScore += timeBonus;
    }
  }
  
  // Mevcut toplam puan + tahmini yeni puan
  const playerTotalScore = (playerScoreData ? playerScoreData.totalScore : 0);
  const currentWithEstimated = playerTotalScore + (isCorrect ? estimatedScore : 0);
  
  // Yeni cevap bilgisi
  const recentAnswer = {
    playerId: player.id,
    playerName: player.name,
    isCorrect,
    questionIndex,
    currentTotalScore: playerTotalScore, // Mevcut toplam puan
    estimatedScore: isCorrect ? estimatedScore : 0, // Tahmini yeni puan
    estimatedTotalScore: currentWithEstimated, // Tahmini toplam puan
    responseTime: actualResponseTime, // Round başlangıcından itibaren geçen süre (ms)
    responseTimeSeconds: Math.floor(actualResponseTime / 1000), // Saniye cinsinden
    timestamp: Date.now(), // Bu da Unix timestamp olarak kalabilir, karşılaştırma için
    attemptCount: gameState.playerAttempts.get(roundKey) || 1 // Deneme sayısı
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
  getRecentAnswers,
  calculateAverageResponseTime
}; 