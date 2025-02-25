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
    console.error('Token doğrulama hatası:', error.message);
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
    // Token'ı Bearer prefix'i ile birlikte gönder
    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    
    console.log('API isteği gönderiliyor:', `${API_URL}/auth/me`);
    console.log('Token:', authHeader);
    
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': authHeader
      },
      timeout: 5000 // 5 saniye timeout
    });

    console.log('API yanıtı:', response.status);
    
    if (response.data && response.data.success) {
      console.log('Kullanıcı bilgileri alındı:', response.data.data.id);
      return {
        id: response.data.data.id,
        name: response.data.data.username,
        fingerprint: response.data.data.fingerprint,
        is_permanent: response.data.data.is_permanent
      };
    }
    
    console.error('API yanıtı başarısız:', response.data);
    return null;
  } catch (error) {
    if (error.response) {
      console.error('API Hata Yanıtı:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('API İstek Hatası (yanıt alınamadı):', error.message);
    } else {
      console.error('API İstek Oluşturma Hatası:', error.message);
    }
    
    // Alternatif olarak token'ı doğrudan doğrula
    try {
      const decoded = verifyToken(token);
      if (decoded && decoded.sub) {
        console.log('Token yerel olarak doğrulandı:', decoded.sub);
        return {
          id: decoded.sub,
          name: decoded.name || 'Kullanıcı',
          fingerprint: decoded.fingerprint || 'unknown',
          is_permanent: false
        };
      }
    } catch (tokenError) {
      console.error('Yerel token doğrulama hatası:', tokenError.message);
    }
    
    return null;
  }
}

module.exports = {
  verifyToken,
  getUserFromAPI
}; 