const { MAX_LIVES } = require('../config/game.config');

class Player {
  constructor(ws, userData) {
    this.ws = ws;
    this.id = userData.id;
    this.name = userData.name;
    this.fingerprint = userData.fingerprint;
    this.is_permanent = userData.is_permanent || false;
    this.lives = userData.lives || MAX_LIVES; // Eğer önceki durum varsa onu kullan
    this.score = userData.score || 0; // Eğer önceki durum varsa onu kullan
    this.lastConnectionTime = Date.now(); // Son bağlantı zamanını tut
  }
}

module.exports = Player; 