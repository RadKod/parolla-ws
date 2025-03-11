const { MAX_LIVES } = require('../config/game.config');

class Player {
  constructor(ws, userData) {
    this.ws = ws;
    this.id = userData.id;
    this.name = userData.name;
    this.fingerprint = userData.fingerprint;
    this.is_permanent = userData.is_permanent || false;
    this.lives = userData.lives || MAX_LIVES; // Eğer önceki durum varsa onu kullan
    
    // API'den gelen başlangıç puanını kaydet
    this.initialTourScore = userData.total_tour_score || 0;
    
    // Veritabanından gelen API puanını kullan (eğer varsa)
    this.score = userData.total_tour_score || 0;
    
    // Oyun sırasında kazanılan puanları yerel olarak sakla
    this.localScore = 0;
    
    this.lastConnectionTime = Date.now(); // Son bağlantı zamanını tut
    this.token = userData.token || null; // Kullanıcı token'ını sakla
    this.isJustJoined = true; // Yeni katıldı mı? Başlangıçta true olarak ayarla
  }
  
  /**
   * Oyun sırasında kazanılan puanları ekler
   * @param {number} points Eklenecek puan
   */
  addPoints(points) {
    this.localScore += points;
  }
  
  /**
   * Oyuncunun toplam puanını döndürür (DB puanı + oyun içi kazanılan)
   * @returns {number} Toplam puan
   */
  getTotalScore() {
    return this.score + this.localScore;
  }
}

module.exports = Player; 