const MessageType = require('../constants/messageTypes');
const { broadcast, sendToPlayer, broadcastToViewers } = require('../utils/websocket');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const { MAX_LIVES, CORRECT_ANSWER_SCORE, NEXT_QUESTION_DELAY, BASE_SCORES } = require('../config/game.config');
const { getUnlimitedQuestions } = require('../services/questionService');
const { isAnswerCorrect } = require('../utils/stringUtils');
const gameState = require('../state/gameState');
const { composeGameEventLog, composeGameStatusLog } = require('../utils/logger');
const { resetRoundScoring, calculateRoundScores, getGameScores, addRecentAnswer, getRecentAnswers, savePlayerScoreToAPI } = require('../services/scoreService');

/**
 * Oyundaki kullanıcı listesini client'a gönderir
 */
function broadcastUserList() {
  if (!gameState.wss) return;
  
  const playerList = [];
  
  // Oyuncu listesini oluştur
  for (const [_, player] of gameState.players) {
    // API puanı + oyun sırasında kazanılan puanları göster
    const displayedScore = player.getTotalScore ? player.getTotalScore() : player.score;
    
    playerList.push({
      id: player.id,
      name: player.name,
      score: displayedScore,
      lives: player.lives,
      avatarUrl: player.avatarUrl || null,
      apiScore: player.score, // API'den gelen saf puanı da gönder
      localScore: player.localScore, // Oyun içinde kazanılan puanı gönder
      isJustJoined: player.isJustJoined // Yeni katıldı mı?
    });
    
    // İlk broadcasttan sonra isJustJoined değerini false yap
    if (player.isJustJoined) {
      player.isJustJoined = false;
    }
  }
  
  // Oyuncu listesini büyükten küçüğe sırala (skora göre)
  playerList.sort((a, b) => b.score - a.score);
  
  const userListMessage = {
    type: MessageType.USER_LIST,
    players: playerList,
    totalCount: playerList.length,
    viewerCount: gameState.viewerCount || 0
  };
  
  console.log(`Kullanıcı listesi güncelleniyor: ${playerList.length} oyuncu, ${gameState.viewerCount || 0} izleyici`);
  
  // Tüm oyunculara ve izleyicilere kullanıcı listesini gönder
  broadcast(gameState.wss, userListMessage, [], true);
}

/**
 * Kullanıcı odaya katıldığında listeyi günceller
 * @param {Object} player Oyuncu bilgileri
 */
function handleUserJoin(player) {
  console.log(`Yeni kullanıcı katıldı: ${player.name} (${player.id})`);
  broadcastUserList();
}

/**
 * Kullanıcı odadan ayrıldığında listeyi günceller
 * @param {Object} player Oyuncu bilgileri
 */
function handleUserLeave(player) {
  console.log(`Kullanıcı ayrıldı: ${player.name} (${player.id})`);
  broadcastUserList();
}

/**
 * Oyunu başlatır ve soruları yükler
 */
async function initializeGame() {
  try {
    // API'den soruları al
    gameState.questions = await getUnlimitedQuestions();
    gameState.questionIndex = 0;
    
    // İlk soruyu gönder
    sendNewQuestion();
  } catch (error) {
    console.error('Oyun başlatma hatası:', error.message);
    broadcast(gameState.wss, {
      type: MessageType.ERROR,
      message: 'Oyun başlatılamadı, lütfen daha sonra tekrar deneyin.'
    });
  }
}

/**
 * Yeni bir soru gönderir
 */
function sendNewQuestion() {
  // Hiç oyuncu yoksa oyunu başlatma
  if (gameState.players.size === 0) {
    const gameStatus = composeGameStatusLog();
    console.log('Game Status (No Players):', JSON.stringify(gameStatus, null, 2));

    if (gameState.timeUpdateInterval) {
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
    }
    if (gameState.roundTimer) {
      clearTimeout(gameState.roundTimer);
      gameState.roundTimer = null;
    }
    gameState.currentQuestion = null;
    gameState.lastQuestionTime = null;
    gameState.waitingStartTime = null;
    return;
  }

  if (gameState.questionIndex >= gameState.questions.length) {
    handleGameRestart();
    return;
  }

  gameState.currentQuestion = gameState.questions[gameState.questionIndex];
  gameState.lastQuestionTime = Date.now();
  gameState.waitingStartTime = null;

  // Round bazlı durumları sıfırla
  gameState.roundLives.clear();
  gameState.roundCorrectAnswers.clear();
  
  // Puanlama sistemi için sıfırlama yap
  resetRoundScoring();
  
  // Son cevaplar listesini sıfırla
  gameState.recentAnswers = [];
  console.log("Yeni soru için recent_answers sıfırlandı");
  
  // Son cevaplar listesinin sıfırlandığını bildir
  broadcast(gameState.wss, {
    type: MessageType.RECENT_ANSWERS,
    answers: []
  }, [], true);

  // Tüm oyuncuların canlarını yenile
  for (const [_, player] of gameState.players) {
    player.lives = MAX_LIVES;
  }

  // Soru mesajını oluştur
  const questionMessage = {
    type: MessageType.QUESTION,
    question: {
      id: gameState.currentQuestion.id,
      question: gameState.currentQuestion.question,
      letter: gameState.currentQuestion.letter
    },
    gameStatus: {
      roundTime: gameState.ROUND_TIME,
      questionNumber: gameState.questionIndex + 1,
      totalQuestions: gameState.questions.length,
      timestamp: gameState.lastQuestionTime,
      viewerCount: gameState.viewerCount || 0
    }
  };

  console.log(`Yeni soru gönderiliyor (ID: ${gameState.currentQuestion.id}), İzleyici sayısı: ${gameState.viewerCount || 0}`);

  // Tüm oyunculara soruyu gönder (izleyicilere gönderme)
  broadcast(gameState.wss, questionMessage, [], false);

  // İzleyicilere de soruyu gönder
  if (gameState.viewerCount > 0) {
    console.log(`${gameState.viewerCount} izleyiciye soru gönderiliyor`);
    broadcastToViewers(gameState.wss, questionMessage);
  }

  // Süre güncellemesi için interval başlat
  startTimeUpdateInterval();

  // Soru süresi dolduğunda
  gameState.roundTimer = setTimeout(() => {
    // Son bir kontrol daha yap
    if (gameState.players.size === 0) {
      clearTimeout(gameState.roundTimer);
      gameState.roundTimer = null;
      return;
    }
    handleTimeUp();
  }, gameState.ROUND_TIME);

  // Yeni soru logu
  const questionLog = composeGameEventLog('new_question', {
    questionId: gameState.currentQuestion.id,
    questionNumber: gameState.questionIndex + 1,
    totalQuestions: gameState.questions.length
  });
  console.log('New Question:', JSON.stringify(questionLog, null, 2));

  // Kullanıcı listesini güncelle ve broadcast et
  broadcastUserList();
}

/**
 * Süre güncellemesi için interval başlatır
 */
function startTimeUpdateInterval() {
  // Mevcut interval'ı temizle
  if (gameState.timeUpdateInterval) {
    clearInterval(gameState.timeUpdateInterval);
    gameState.timeUpdateInterval = null;
  }

  // İlk süre bilgisini hesapla
  const initialTimeInfo = getRemainingTime(gameState.lastQuestionTime);
  
  // Eğer süre zaten bitmişse
  if (initialTimeInfo.remaining <= 0) {
    handleTimeUp();
    return;
  }

  // Süre güncelleme mesajını oluştur
  const timeUpdateMessage = {
    type: MessageType.TIME_UPDATE,
    time: initialTimeInfo
  };

  // İlk süre güncellemesini hemen gönder (izleyicilere gönderme)
  broadcast(gameState.wss, timeUpdateMessage, [], false);
  
  // İzleyicilere de süre güncellemesini gönder
  if (gameState.viewerCount > 0) {
    console.log(`${gameState.viewerCount} izleyiciye süre güncellemesi gönderiliyor`);
    broadcastToViewers(gameState.wss, timeUpdateMessage);
  }

  console.log('Time Update Started:', {
    initialRemaining: initialTimeInfo.remaining,
    timestamp: new Date().toISOString()
  });

  // Interval'ı başlat
  let lastUpdateTime = Date.now();
  gameState.timeUpdateInterval = setInterval(() => {
    // Her interval'da süreyi tekrar hesapla
    const timeInfo = getRemainingTime(gameState.lastQuestionTime);
    const now = Date.now();
    
    // Son güncelleme üzerinden çok zaman geçtiyse (bağlantı kopukluğu vs.)
    if (now - lastUpdateTime > 2000) { // 2 saniyeden fazla geçtiyse
      console.log('Time Update Reset:', {
        timeSinceLastUpdate: now - lastUpdateTime,
        timestamp: new Date().toISOString()
      });
      // Interval'ı yeniden başlat
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
      startTimeUpdateInterval();
      return;
    }
    
    // Hiç oyuncu kalmadıysa interval'ı temizle
    if (gameState.players.size === 0) {
      console.log('Time Update Stopped (No Players):', {
        timestamp: new Date().toISOString()
      });
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
      return;
    }
    
    // Süre devam ediyorsa güncelleme gönder
    if (timeInfo.remaining > 0) {
      const timeUpdateMsg = {
        type: MessageType.TIME_UPDATE,
        time: timeInfo
      };
      
      broadcast(gameState.wss, timeUpdateMsg, [], false);
      
      // İzleyicilere de süre güncellemesini gönder
      if (gameState.viewerCount > 0) {
        broadcastToViewers(gameState.wss, timeUpdateMsg);
      }
      
      lastUpdateTime = now;
    } 
    // Süre bittiyse
    else {
      console.log('Time Update Completed:', {
        timestamp: new Date().toISOString()
      });
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
      handleTimeUp();
    }
  }, 1000);

  // Güvenlik için maksimum süre sonunda interval'i temizle
  const cleanupTimeout = setTimeout(() => {
    if (gameState.timeUpdateInterval) {
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
      
      // Son bir kontrol daha yap
      const finalTimeInfo = getRemainingTime(gameState.lastQuestionTime);
      if (finalTimeInfo.remaining <= 0) {
        handleTimeUp();
      } else {
        // Eğer hala süre varsa interval'ı yeniden başlat
        startTimeUpdateInterval();
      }
    }
  }, Math.min(initialTimeInfo.remaining + 2000, gameState.ROUND_TIME)); // Kalan süre + 2 saniye güvenlik payı

  // Cleanup timeout'u gameState'e kaydet
  gameState.timeUpdateCleanupTimeout = cleanupTimeout;
}

/**
 * Soru süresi dolduğunda yapılacak işlemler
 */
function handleTimeUp() {
  // Önce interval'ı temizle
  if (gameState.timeUpdateInterval) {
    clearInterval(gameState.timeUpdateInterval);
    gameState.timeUpdateInterval = null;
  }

  // Cleanup timeout'u temizle
  if (gameState.timeUpdateCleanupTimeout) {
    clearTimeout(gameState.timeUpdateCleanupTimeout);
    gameState.timeUpdateCleanupTimeout = null;
  }

  // Round timer'ı temizle
  if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  // Tur puanlarını hesapla
  const roundScores = calculateRoundScores(gameState.questionIndex);

  // Doğru cevap mesajını oluştur
  const timeUpMessage = {
    type: MessageType.TIME_UP,
    correctAnswer: gameState.currentQuestion.answer
  };

  console.log(`Süre doldu, doğru cevap: ${gameState.currentQuestion.answer}`);

  // Tüm oyunculara doğru cevabı gönder (izleyicilere gönderme)
  broadcast(gameState.wss, timeUpMessage, [], false);
  
  // İzleyicilere de doğru cevabı gönder
  if (gameState.viewerCount > 0) {
    console.log(`${gameState.viewerCount} izleyiciye doğru cevap gönderiliyor`);
    broadcastToViewers(gameState.wss, timeUpMessage);
  }

  // Tur puanlarını gönder - Her durumda gönder (kimse doğru bilmediğinde boş liste olacak)
  const roundScoresMessage = {
    type: MessageType.ROUND_SCORES,
    scores: roundScores,
    questionIndex: gameState.questionIndex
  };
  
  console.log(`Tur puanları gönderiliyor: ${roundScores.length} oyuncu`);
  
  // Tüm oyunculara ve izleyicilere tur puanlarını gönder
  broadcast(gameState.wss, roundScoresMessage, [], true);

  // Oyuncuların puanlarını API'ye kaydet
  if (gameState.players.size > 0) {
    console.log(`${gameState.players.size} oyuncunun puanları API'ye kaydediliyor...`);
    
    // Her oyuncu için puan kaydet
    for (const [playerId, player] of gameState.players) {
      // Skoru kaydedecek fonksiyonu çağır
      if (player.token && player.localScore > 0) {
        console.log(`${player.name} için tur puanı API'ye kaydediliyor: ${player.localScore} puan (API=${player.score}, Toplam=${player.getTotalScore()})`);
        
        savePlayerScoreToAPI(player.token, player.localScore)
          .then(result => {
            if (result) {
              console.log(`${player.name} için puan kaydedildi: ${player.localScore} puan`);
              
              // API yanıtını kontrol et
              let apiTotalScore = null;
              
              // result'ın kendisi bir nesne olabilir veya data içinde olabilir
              if (result.total_tour_score !== undefined) {
                apiTotalScore = result.total_tour_score;
              } else if (result.data && result.data.total_tour_score !== undefined) {
                apiTotalScore = result.data.total_tour_score;
              }
              
              if (apiTotalScore !== null) {
                // API'den yeni toplam puan döndüyse, kullan
                console.log(`${player.name} için API'den dönen yeni toplam puan: ${apiTotalScore}`);
                player.score = apiTotalScore;
              } else {
                // API'den toplam puan dönmediyse, bu tur öncesi puanı koru
                console.log(`${player.name} için API'den total_tour_score dönmedi, var olan puanı koruyoruz: ${player.score}`);
              }
              
              // Yerel puanı sıfırla - puan API'ye kaydedildi, artık local değil
              player.localScore = 0;
            } else {
              console.log(`${player.name} için puan kaydedilemedi.`);
            }
          })
          .catch(error => {
            console.error(`${player.name} için puan kaydedilirken hata oluştu:`, error.message);
          });
      } else {
        console.log(`${player.name} için puan kaydedilmedi: Token yok veya local puan 0`);
      }
    }
  }

  // Bekleme süresini başlat
  gameState.waitingStartTime = Date.now();
  gameState.questionIndex++;

  // Bekleme süresi mesajını oluştur
  const initialWaitingTime = getRemainingWaitingTime(gameState.waitingStartTime);
  const waitingMessage = {
    type: MessageType.WAITING_NEXT,
    time: initialWaitingTime
  };

  console.log(`Bekleme süresi başladı: ${NEXT_QUESTION_DELAY}ms`);

  // İlk waiting_next güncellemesini hemen gönder (izleyicilere gönderme)
  broadcast(gameState.wss, waitingMessage, [], false);
  
  // İzleyicilere de bekleme mesajını gönder
  if (gameState.viewerCount > 0) {
    console.log(`${gameState.viewerCount} izleyiciye bekleme mesajı gönderiliyor`);
    broadcastToViewers(gameState.wss, waitingMessage);
  }

  // Bekleme süresi için interval başlat
  let waitingInterval = setInterval(() => {
    const timeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
    
    // Süre bitmemişse güncelleme gönder
    if (timeInfo.remaining > 0) {
      const waitingUpdateMsg = {
        type: MessageType.WAITING_NEXT,
        time: timeInfo,
        correctAnswer: gameState.currentQuestion.answer,
        roundScore: roundScores
      };
      
      broadcast(gameState.wss, waitingUpdateMsg, [], false);
      
      // İzleyicilere de bekleme güncellemesini gönder
      if (gameState.viewerCount > 0) {
        broadcastToViewers(gameState.wss, waitingUpdateMsg);
      }
    } 
    // Süre tam bittiyse yeni soruya geç
    else if (timeInfo.remaining === 0) {
      clearInterval(waitingInterval);
      waitingInterval = null;
      sendNewQuestion();
    }
  }, 1000);

  // Güvenlik için maksimum bekleme süresi sonunda interval'i temizle
  setTimeout(() => {
    if (waitingInterval) {
      clearInterval(waitingInterval);
      waitingInterval = null;
      // Yeni soruya geçmeden önce son bir kontrol
      const finalTimeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
      if (finalTimeInfo.remaining <= 0) {
        sendNewQuestion();
      }
    }
  }, NEXT_QUESTION_DELAY + 1000); // 1 saniye ekstra güvenlik payı

  // Süre doldu logu
  const timeUpLog = composeGameEventLog('time_up', {
    questionId: gameState.currentQuestion.id,
    questionNumber: gameState.questionIndex,
    correctAnswer: gameState.currentQuestion.answer
  });
  console.log('Time Up:', JSON.stringify(timeUpLog, null, 2));

  // Kullanıcı listesini güncelle ve broadcast et
  broadcastUserList();
}

/**
 * Oyuncunun cevabını değerlendirir
 * @param {Player} player Oyuncu
 * @param {string} answer Cevap
 */
function handleAnswer(player, answer) {
  console.log(`HandleAnswer başladı: ${player.name}, cevap: ${answer}`);
  
  // Sadece mevcut soru varsa ve süre devam ediyorsa
  if (!gameState.currentQuestion) {
    console.log("Geçerli soru yok, cevap işlenmedi.");
    return;
  }

  const timeInfo = getRemainingTime(gameState.lastQuestionTime);
  if (timeInfo.remaining <= 0) {
    console.log("Süre dolmuş, cevap işlenmedi.");
    return;
  }

  // Bu round için doğru cevap vermişse tekrar cevap veremesin
  const roundKey = `${gameState.questionIndex}_${player.id}`;
  if (gameState.roundCorrectAnswers.get(roundKey)) {
    console.log(`${player.name} zaten doğru cevap vermiş.`);
    sendToPlayer(player.ws, {
      type: MessageType.ERROR,
      message: 'You have already answered this question correctly'
    });
    return;
  }

  // Bu round için canı bitmişse cevap veremesin
  const roundLives = gameState.roundLives.get(roundKey) ?? player.lives;
  if (roundLives <= 0) {
    console.log(`${player.name} canı bitmiş, cevap veremez.`);
    sendToPlayer(player.ws, {
      type: MessageType.ERROR,
      message: 'You are out of lives for this round'
    });
    return;
  }

  // Deneme sayısını takip et (puanlama için)
  const currentAttempts = gameState.playerAttempts.get(roundKey) || 0;
  gameState.playerAttempts.set(roundKey, currentAttempts + 1);
  
  // Cevabı küçük harfe çevir ve boşlukları temizle
  const cleanAnswer = answer.toLocaleLowerCase('tr').trim();
  
  // Doğru cevapları virgülle ayır ve her birini temizle
  const correctAnswers = gameState.currentQuestion.answer
    .toLocaleLowerCase('tr')
    .split(',')
    .map(ans => ans.trim());

  // Her bir alternatif cevap için kontrol et
  const isCorrect = correctAnswers.some(correctAns => 
    isAnswerCorrect(cleanAnswer, correctAns)
  );
  
  console.log(`Cevap doğruluk kontrolü: ${cleanAnswer}, isCorrect=${isCorrect}`);

  // Round başlangıcından itibaren geçen süreyi hesapla
  const responseTime = gameState.ROUND_TIME - timeInfo.remaining;

  // YANLIŞ CEVAP İŞLEMİ
  if (!isCorrect) {
    player.lives--;
    console.log(`${player.name} yanlış cevap verdi, kalan can: ${player.lives}`);
    
    // Round bazlı can durumunu kaydet
    gameState.roundLives.set(roundKey, player.lives);
    
    // Can 0'a düştüğünde game over mesajı gönder
    if (player.lives <= 0) {
      player.lives = 0; // Negatife düşmesini engelle
      sendToPlayer(player.ws, {
        type: MessageType.GAME_OVER,
        message: 'You are out of lives for this round, wait for the next question',
        score: player.score
      });
    }
  } 
  // DOĞRU CEVAP İŞLEMİ
  else {
    console.log(`${player.name} doğru cevap verdi!`);
    
    // Doğru cevap verdiğini kaydet
    gameState.roundCorrectAnswers.set(roundKey, true);
    
    // Yanıt süresini hesapla ve kaydet
    gameState.playerTimes.set(roundKey, responseTime);
    
    // Doğru cevap veren oyuncular listesine ekle (sıralama için)
    gameState.correctAnswerPlayers.push(player.id);
    
    // Oyuncunun skorunu kaydet ve güncelle
    let playerScoreData = gameState.playerScores.get(player.id) || {
      totalScore: 0,
      rounds: {},
      answerResults: []
    };
    
    // Doğru bildiği için sıralamasına göre puan hesapla
    const playerRank = gameState.correctAnswerPlayers.length - 1; // 0-based index
    
    // Baz puanı belirle (sıralamaya göre)
    const baseScore = playerRank < BASE_SCORES.length ? BASE_SCORES[playerRank] : 0;
    
    // Anlık hesaplanan puanı ekle
    playerScoreData.totalScore += baseScore;
    
    // Oyuncunun oyun içi puanını güncelle (player.score yerine player.addPoints kullan)
    player.addPoints(baseScore);
    
    // Cevap sonucunu kaydet
    playerScoreData.answerResults.push({
      questionIndex: gameState.questionIndex,
      score: playerScoreData.totalScore,
      responseTime: responseTime,
      timestamp: Date.now()
    });
    
    gameState.playerScores.set(player.id, playerScoreData);
    
    // Tahmini sıralama ve puanı kaydet
    gameState.roundEstimatedScores = gameState.roundEstimatedScores || new Map();
    gameState.roundEstimatedScores.set(roundKey, {
      rank: playerRank + 1,
      score: baseScore,
      totalScore: playerScoreData.totalScore
    });
    
    console.log(`${player.name} puanı güncellendi: Yerel=${player.localScore}, API=${player.score}, Toplam=${player.getTotalScore()}`);
    console.log(`DOĞRU CEVAP KONTROLÜ: isCorrect değeri = ${isCorrect}, roundKey = ${roundKey}`);
  }

  // ******* KRİTİK BÖLGE *******
  // Bu kısım kesinlikle çalışmalı ve isCorrect değerine göre farklı işlem yapmamalı

  // Son cevaplar listesini güncelle
  console.log(`Recent Answers güncelleniyor... cevap=${isCorrect ? 'DOĞRU' : 'YANLIŞ'}, isCorrect değeri=${isCorrect}`);
  const recentAnswers = addRecentAnswer(player, isCorrect, gameState.questionIndex, responseTime);
  
  // Recent Answers mesajını broadcast et - HEM DOĞRU HEM YANLIŞ CEVAPTA
  console.log(`Broadcast öncesi: isCorrect=${isCorrect}, player=${player.name}, recentAnswers.length=${recentAnswers ? recentAnswers.length : 0}`);
  broadcast(gameState.wss, {
    type: MessageType.RECENT_ANSWERS,
    answers: recentAnswers
  }, [], true);
  
  console.log(`Recent Answers broadcast edildi (${isCorrect ? 'DOĞRU' : 'YANLIŞ'} cevap için), toplam ${recentAnswers.length} cevap, WebSocket çalışıyor mu: ${player.ws.readyState === 1}`);

  // Cevap sonucunu oyuncuya gönder - HEM DOĞRU HEM YANLIŞ CEVAPTA 
  console.log(`ANSWER_RESULT göndermeden önce: isCorrect=${isCorrect}, player=${player.name}, lives=${player.lives}, score=${player.getTotalScore()}`);
  
  const answerResultMessage = {
    type: MessageType.ANSWER_RESULT,
    correct: isCorrect,
    lives: player.lives,
    score: player.getTotalScore ? player.getTotalScore() : player.score,
    apiScore: player.score,
    localScore: player.localScore,
    questionIndex: gameState.questionIndex,
    responseTime: responseTime,
    responseTimeSeconds: Math.floor(responseTime / 1000),
    attemptCount: currentAttempts,
    timestamp: Date.now(),
    answerTimeDescription: `${Math.floor(responseTime / 1000)} saniyede cevaplandı`
  };
  
  try {
    sendToPlayer(player.ws, answerResultMessage);
    console.log(`Answer Result başarıyla gönderildi (${isCorrect ? 'DOĞRU' : 'YANLIŞ'} cevap için): can=${player.lives}, puan=${player.getTotalScore()}, full data=${JSON.stringify(answerResultMessage)}`);
  } catch (error) {
    console.error(`ANSWER_RESULT gönderirken hata oluştu (${player.name}): ${error.message}`);
  }
}

/**
 * Oyunu yeniden başlatır
 */
async function handleGameRestart() {
  // Genel puan tablosunu hesapla ve gönder
  const gameScores = getGameScores();
  
  if (gameScores.length > 0) {
    const gameScoresMessage = {
      type: MessageType.GAME_SCORES,
      scores: gameScores
    };
    
    console.log(`Oyun puanları gönderiliyor: ${gameScores.length} oyuncu`);
    
    // Tüm oyunculara ve izleyicilere oyun puanlarını gönder
    broadcast(gameState.wss, gameScoresMessage, [], true);
  }
  
  const restartMessage = {
    type: MessageType.GAME_RESTART
  };
  
  console.log('Oyun yeniden başlatılıyor...');
  
  broadcast(gameState.wss, restartMessage, [], false);
  
  // İzleyicilere de yeniden başlatma mesajını gönder
  if (gameState.viewerCount > 0) {
    console.log(`${gameState.viewerCount} izleyiciye yeniden başlatma mesajı gönderiliyor`);
    broadcastToViewers(gameState.wss, restartMessage);
  }

  // Oyun durumunu sıfırla
  gameState.questionIndex = 0;
  gameState.currentQuestion = null;
  gameState.lastQuestionTime = null;
  gameState.waitingStartTime = null;
  
  // Puanlama sistemini sıfırlamak yerine, oyuncuların toplam puanlarını koru
  // Ancak yeni round için gerekli yapıları temizle
  for (const [playerId, playerScore] of gameState.playerScores) {
    // Toplam puanı koru
    const totalScore = playerScore.totalScore;
    const answerHistory = playerScore.answerResults || [];
    
    // Tur bilgilerini sıfırla
    playerScore.rounds = {};
    
    // Toplam puanı ve geçmiş cevapları koru
    playerScore.totalScore = totalScore;
    playerScore.answerResults = answerHistory;
    
    // Güncellenen veriyi geri kaydet
    gameState.playerScores.set(playerId, playerScore);
  }
  
  // Son cevaplar listesini de sıfırla
  gameState.recentAnswers = [];
  
  // Son cevaplar listesinin sıfırlandığını bildir
  broadcast(gameState.wss, {
    type: MessageType.RECENT_ANSWERS,
    answers: []
  }, [], true);

  if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  if (gameState.timeUpdateInterval) {
    clearInterval(gameState.timeUpdateInterval);
    gameState.timeUpdateInterval = null;
  }

  // Yeni soruları yükle ve oyunu başlat
  try {
    gameState.questions = await getUnlimitedQuestions();
    
    setTimeout(() => {
      sendNewQuestion();
    }, 3000);
  } catch (error) {
    console.error('Oyun yeniden başlatma hatası:', error.message);
    broadcast(gameState.wss, {
      type: MessageType.ERROR,
      message: 'Oyun yeniden başlatılamadı, lütfen daha sonra tekrar deneyin.'
    });
  }

  // Oyun yeniden başlatma logu
  const restartLog = composeGameEventLog('game_restart');
  console.log('Game Restart:', JSON.stringify(restartLog, null, 2));
}

module.exports = {
  initializeGame,
  sendNewQuestion,
  handleAnswer,
  handleTimeUp,
  handleGameRestart,
  startTimeUpdateInterval,
  broadcastUserList,
  handleUserJoin,
  handleUserLeave
};
