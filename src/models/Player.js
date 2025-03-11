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
    this.initialTourScore = userData.total_tour_score;
    
    // Öncelikle API'den gelen total_tour_score değerini kontrol et
    // Eğer varsa onu kullan, yoksa önceki score veya 0 kullan
    this.score = userData.total_tour_score !== undefined ? userData.total_tour_score : (userData.score || 0);
    
    this.lastConnectionTime = Date.now(); // Son bağlantı zamanını tut
    this.token = userData.token || null; // Kullanıcı token'ını sakla
    this.isJustJoined = true; // Yeni katıldı mı? Başlangıçta true olarak ayarla
  }
}

module.exports = Player; 