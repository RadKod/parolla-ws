const jwt = require('jsonwebtoken');
const axios = require('axios');
const https = require('https');
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
    // SSL sertifika doğrulamasını devre dışı bırak
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });

    console.log(`API isteği gönderiliyor: ${API_URL}/auth/me`);
    
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      httpsAgent: httpsAgent // SSL doğrulamasını devre dışı bırak
    });

    console.log('API yanıt durumu:', response.status);

    if (response.data && response.data.success) {
      console.log('Kullanıcı bilgileri alındı:', response.data.data.username);
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
      // Sunucu yanıtı ile dönen hata
      console.error('API Yanıt Hatası:', error.response.status, error.response.data);
    } else if (error.request) {
      // İstek yapıldı ama yanıt alınamadı
      console.error('API İstek Hatası:', error.message);
    } else {
      // İstek oluşturulurken hata oluştu
      console.error('API İstek Oluşturma Hatası:', error.message);
    }
    
    // API başarısız olursa, token'ı yerel olarak doğrulamayı dene
    const userData = verifyToken(token);
    if (userData) {
      console.log('Token yerel olarak doğrulandı:', userData.username);
      return {
        id: userData.id,
        name: userData.username,
        fingerprint: userData.fingerprint,
        is_permanent: userData.is_permanent
      };
    }
    
    return null;
  }
}

module.exports = {
  verifyToken,
  getUserFromAPI
}; 