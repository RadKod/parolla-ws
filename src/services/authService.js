const jwt = require('jsonwebtoken');
const axios = require('axios');
const { JWT_SECRET, API_URL } = require('../config/api.config');

/**
 * JWT token'ı doğrular
 * @param {string} token JWT token
 * @returns {Object|null} Doğrulanmış token verisi veya null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * API'den kullanıcı bilgilerini alır
 * @param {string} token JWT token
 * @returns {Promise<Object|null>} Kullanıcı bilgileri veya null
 */
async function getUserFromAPI(token) {
  try {
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      return {
        id: response.data.data.id,
        name: response.data.data.username,
        fingerprint: response.data.data.fingerprint,
        is_permanent: response.data.data.is_permanent
      };
    }
    return null;
  } catch (error) {
    console.error('API Error:', error.message);
    return null;
  }
}

module.exports = {
  verifyToken,
  getUserFromAPI
}; 