/**
 * API ve Güvenlik ayarları
 */
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET,
  API_URL: process.env.API_URL || 'http://parolla-backend.test/api/v1',
  PORT: process.env.PORT || 8080,
  HOST: process.env.HOST || 'localhost'
}; 