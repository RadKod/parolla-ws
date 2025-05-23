/**
 * WebSocket mesaj tipleri için enum
 * @enum {string}
 */
module.exports = {
  /** Oyuncunun oyuna başarıyla bağlandığını bildirir */
  CONNECTED: 'connected',
  
  /** Yeni bir soru gönderildiğini bildirir */
  QUESTION: 'question',
  
  /** Her saniye gönderilen süre güncellemesi */
  TIME_UPDATE: 'time_update',
  
  /** Sorunun süresinin dolduğunu ve doğru cevabın gösterileceğini bildirir */
  TIME_UP: 'time_up',
  
  /** Yeni soruya geçmeden önceki bekleme süresini bildirir */
  WAITING_NEXT: 'waiting_next',
  
  /** Tüm soruların tamamlandığını ve oyunun yeniden başlayacağını bildirir */
  GAME_RESTART: 'game_restart',
  
  /** Bir hata oluştuğunu bildirir */
  ERROR: 'error',
  
  /** Oyuncunun soruya cevap verdiğini bildirir */
  ANSWER: 'answer',
  
  /** Oyuncunun cevabının doğru/yanlış olduğunu bildirir */
  ANSWER_RESULT: 'answer_result',
  
  /** Oyuncunun canlarının bittiğini ve oyunun bittiğini bildirir */
  GAME_OVER: 'game_over',

  /** Bir oyuncunun oyundan ayrıldığını bildirir */
  PLAYER_LEFT: 'player_left',

  /** Yeni bir oyuncunun oyuna katıldığını bildirir */
  PLAYER_JOINED: 'player_joined',

  /** Oyuncu listesi güncellemesini bildirir */
  PLAYER_LIST_UPDATE: 'player_list_update',

  /** Sistem mesajlarını bildirir */
  SYSTEM_MESSAGE: 'system_message',
  
  /** İzleyici sayısı güncellemesini bildirir */
  VIEWER_COUNT_UPDATE: 'viewer_count_update',
  
  /** Kullanıcının chat mesajı gönderdiğini bildirir */
  CHAT_MESSAGE: 'chat_message',
  
  /** Tüm chat mesajlarını bildirir */
  CHAT_HISTORY: 'chat_history',
  
  /** Oyuncunun puan durumunu bildirir */
  SCORE_UPDATE: 'score_update',

  /** Tur sonunda puan tablosunu bildirir */
  ROUND_SCORES: 'round_scores',

  /** Oyun sonunda genel puan tablosunu bildirir */
  GAME_SCORES: 'game_scores',
  
  /** Son cevapları bildirir */
  RECENT_ANSWERS: 'recent_answers',
  
  /** Oyundaki kullanıcı listesini bildirir */
  USER_LIST: 'user_list'
}; 