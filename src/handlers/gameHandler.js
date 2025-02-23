const MessageType = require('../constants/messageTypes');
const { broadcast, sendToPlayer } = require('../utils/websocket');
const { getRemainingTime, getRemainingWaitingTime } = require('../services/timeService');
const { MAX_LIVES, CORRECT_ANSWER_SCORE, NEXT_QUESTION_DELAY } = require('../config/game.config');
const { getUnlimitedQuestions } = require('../services/questionService');
const { isAnswerCorrect } = require('../utils/stringUtils');
const gameState = require('../state/gameState');

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
  // Önceki zamanlayıcıları temizle
  if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  if (gameState.timeUpdateInterval) {
    clearInterval(gameState.timeUpdateInterval);
    gameState.timeUpdateInterval = null;
  }

  if (gameState.waitingInterval) {
    clearInterval(gameState.waitingInterval);
    gameState.waitingInterval = null;
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
    handleTimeUp();
  }, gameState.ROUND_TIME);
}

/**
 * Süre güncellemesi için interval başlatır
 */
function startTimeUpdateInterval() {
  // Önceki interval varsa temizle
  if (gameState.timeUpdateInterval) {
    clearInterval(gameState.timeUpdateInterval);
    gameState.timeUpdateInterval = null;
  }

  gameState.timeUpdateInterval = setInterval(() => {
    const timeInfo = getRemainingTime(gameState.lastQuestionTime);
    
    broadcast(gameState.wss, {
      type: MessageType.TIME_UPDATE,
      time: timeInfo
    });

    if (timeInfo.remaining <= 0) {
      clearInterval(gameState.timeUpdateInterval);
      gameState.timeUpdateInterval = null;
      handleTimeUp();
    }
  }, 1000);
}

/**
 * Soru süresi dolduğunda yapılacak işlemler
 */
function handleTimeUp() {
  // Tüm zamanlayıcıları temizle
  if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  if (gameState.timeUpdateInterval) {
    clearInterval(gameState.timeUpdateInterval);
    gameState.timeUpdateInterval = null;
  }

  if (gameState.waitingInterval) {
    clearInterval(gameState.waitingInterval);
    gameState.waitingInterval = null;
  }

  // Tüm oyunculara doğru cevabı gönder
  broadcast(gameState.wss, {
    type: MessageType.TIME_UP,
    correctAnswer: gameState.currentQuestion.answer
  });

  gameState.waitingStartTime = Date.now();
  gameState.questionIndex++;

  // Bekleme süresi için interval başlat
  const sendWaitingUpdate = () => {
    const timeInfo = getRemainingWaitingTime(gameState.waitingStartTime);
    
    broadcast(gameState.wss, {
      type: MessageType.WAITING_NEXT,
      time: timeInfo
    });

    if (timeInfo.remaining <= 0) {
      if (gameState.waitingInterval) {
        clearInterval(gameState.waitingInterval);
        gameState.waitingInterval = null;
      }
      sendNewQuestion();
    }
  };

  // İlk güncellemeyi hemen gönder
  sendWaitingUpdate();

  // Sonraki güncellemeleri interval ile gönder
  gameState.waitingInterval = setInterval(sendWaitingUpdate, 1000);

  // Güvenlik için maksimum bekleme süresi sonunda interval'i temizle
  setTimeout(() => {
    if (gameState.waitingInterval) {
      clearInterval(gameState.waitingInterval);
      gameState.waitingInterval = null;
      sendNewQuestion();
    }
  }, NEXT_QUESTION_DELAY + 1000); // 1 saniye ekstra güvenlik payı
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

  if (gameState.waitingInterval) {
    clearInterval(gameState.waitingInterval);
    gameState.waitingInterval = null;
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
}

module.exports = {
  initializeGame,
  sendNewQuestion,
  handleAnswer,
  handleTimeUp,
  handleGameRestart,
  startTimeUpdateInterval
}; 