const { MAX_LIVES } = require('../config/game.config');

class Player {
  constructor(socket, userData) {
    this.socket = socket;
    this.id = userData.id;
    this.name = userData.name;
    this.fingerprint = userData.fingerprint;
    this.is_permanent = userData.is_permanent;
    this.lives = MAX_LIVES; // Başlangıçta MAX_LIVES olarak ayarla
    this.score = 0;
  }
}

module.exports = Player; 