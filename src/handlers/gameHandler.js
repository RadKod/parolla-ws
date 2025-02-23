const MessageType = require('../constants/messageTypes');
const { broadcast, sendToPlayer } = require('../utils/websocket');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const { MAX_LIVES, CORRECT_ANSWER_SCORE, NEXT_QUESTION_DELAY } = require('../config/game.config');
const { getUnlimitedQuestions } = require('../services/questionService');
const { isAnswerCorrect } = require('../utils/stringUtils');
const gameState = require('../state/gameState');
const { composeGameEventLog, composeGameStatusLog } = require('../utils/logger');

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

  // Tüm oyuncuların canlarını yenile
  for (const [_, player] of gameState.players) {
    player.lives = MAX_LIVES;
  }

  // Tüm oyunculara soruyu gönder
  broadcast(gameState.wss, {
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
      timestamp: gameState.lastQuestionTime
    }
  });

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

  // İlk süre güncellemesini hemen gönder
  broadcast(gameState.wss, {
    type: MessageType.TIME_UPDATE,
    time: initialTimeInfo
  });
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
      broadcast(gameState.wss, {
        type: MessageType.TIME_UPDATE,
        time: timeInfo
      });
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

  // Tüm oyunculara doğru cevabı gönder
  broadcast(gameState.wss, {
    type: MessageType.TIME_UP,
    correctAnswer: gameState.currentQuestion.answer
  });

  // Bekleme süresini başlat
  gameState.waitingStartTime = Date.now();
  gameState.questionIndex++;

  // İlk waiting_next güncellemesini hemen gönder
  const initialWaitingTime = getRemainingWaitingTime(gameState.waitingStartTime);
  broadcast(gameState.wss, {
    type: MessageType.WAITING_NEXT,
    time: initialWaitingTime
  });

  // Bekleme süresi için interval başlat
  let waitingInterval = setInterval(() => {
    const timeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
    
    // Süre bitmemişse güncelleme gönder
    if (timeInfo.remaining > 0) {
      broadcast(gameState.wss, {
        type: MessageType.WAITING_NEXT,
        time: timeInfo
      });
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
}

/**
 * Oyuncunun cevabını işler
 * @param {Player} player Oyuncu
 * @param {string} answer Cevap
 */
function handleAnswer(player, answer) {
  // Sadece mevcut soru varsa ve süre devam ediyorsa
  if (!gameState.currentQuestion) return;

  const timeInfo = getRemainingTime(gameState.lastQuestionTime);
  if (timeInfo.remaining <= 0) return;

  // Bu round için doğru cevap vermişse tekrar cevap veremesin
  const roundKey = `${gameState.questionIndex}_${player.id}`;
  if (gameState.roundCorrectAnswers.get(roundKey)) {
    sendToPlayer(player.ws, {
      type: MessageType.ERROR,
      message: 'You have already answered this question correctly'
    });
    return;
  }

  // Bu round için canı bitmişse cevap veremesin
  const roundLives = gameState.roundLives.get(roundKey) ?? player.lives;
  if (roundLives <= 0) {
    sendToPlayer(player.ws, {
      type: MessageType.ERROR,
      message: 'You are out of lives for this round'
    });
    return;
  }

  // Cevabı küçük harfe çevir ve boşlukları temizle
  const cleanAnswer = answer.toLowerCase().trim();
  
  // Doğru cevapları virgülle ayır ve her birini temizle
  const correctAnswers = gameState.currentQuestion.answer
    .toLowerCase()
    .split(',')
    .map(ans => ans.trim());

  // Her bir alternatif cevap için kontrol et
  const isCorrect = correctAnswers.some(correctAns => 
    isAnswerCorrect(cleanAnswer, correctAns)
  );

  if (!isCorrect) {
    player.lives--;
    
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
  } else {
    player.score += CORRECT_ANSWER_SCORE;
    // Doğru cevap verdiğini kaydet
    gameState.roundCorrectAnswers.set(roundKey, true);
  }

  // Cevap logu
  const answerLog = composeGameEventLog('player_answer', {
    playerId: player.id,
    playerName: player.name,
    answer: cleanAnswer,
    isCorrect,
    remainingLives: player.lives,
    score: player.score
  });
  console.log('Player Answer:', JSON.stringify(answerLog, null, 2));

  sendToPlayer(player.ws, {
    type: MessageType.ANSWER_RESULT,
    correct: isCorrect,
    lives: player.lives,
    score: player.score
  });
}

/**
 * Oyunu yeniden başlatır
 */
async function handleGameRestart() {
  broadcast(gameState.wss, {
    type: MessageType.GAME_RESTART
  });

  // Oyun durumunu sıfırla
  gameState.questionIndex = 0;
  gameState.currentQuestion = null;
  gameState.lastQuestionTime = null;
  gameState.waitingStartTime = null;

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
  startTimeUpdateInterval
}; 