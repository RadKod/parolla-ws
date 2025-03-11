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
    // Değerin undefined olmaması için kesinlikle 0 değerini kullan
    this.score = userData.total_tour_score !== undefined ? userData.total_tour_score : 0;
    
    // Debug için konsola yazdır
    console.log(`Player constructor: ${this.name} için score ayarlandı = ${this.score}, userData.total_tour_score = ${userData.total_tour_score}`);
    
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
    // Debug log ekle
    console.log(`addPoints: ${this.name} için ${points} puan eklendi, yeni localScore = ${this.localScore}, toplam = ${this.getTotalScore()}`);
  }
  
  /**
   * Oyuncunun toplam puanını döndürür (DB puanı + oyun içi kazanılan)
   * @returns {number} Toplam puan
   */
  getTotalScore() {
    const total = this.score + this.localScore;
    // Debug log ekle
    console.log(`getTotalScore: ${this.name} için çağrıldı, score = ${this.score}, localScore = ${this.localScore}, toplam = ${total}`);
    return total;
  }
}

module.exports = Player; 