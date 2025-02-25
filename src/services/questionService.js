const axios = require('axios');
const https = require('https');
const { API_URL } = require('../config/api.config');

/**
 * API'den sınırsız mod sorularını alır
 * @returns {Promise<Array>} Sorular listesi
 */
async function getUnlimitedQuestions() {
  try {
    // SSL sertifika doğrulamasını devre dışı bırak
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    console.log(`Sorular için API isteği gönderiliyor: ${API_URL}/modes/unlimited`);
    
    const response = await axios.get(`${API_URL}/modes/unlimited`, {
      httpsAgent: httpsAgent // SSL doğrulamasını devre dışı bırak
    });
    
    console.log('Soru API yanıt durumu:', response.status);
    
    if (response.data.success && response.data.data.questions) {
      console.log(`${response.data.data.questions.length} soru başarıyla yüklendi`);
      return response.data.data.questions;
    }
    
    console.error('API yanıtı başarısız:', response.data);
    throw new Error('Sorular alınamadı');
  } catch (error) {
    if (error.response) {
      // Sunucu yanıtı ile dönen hata
      console.error('Soru API Yanıt Hatası:', error.response.status, error.response.data);
    } else if (error.request) {
      // İstek yapıldı ama yanıt alınamadı
      console.error('Soru API İstek Hatası:', error.message);
    } else {
      // İstek oluşturulurken hata oluştu
      console.error('Soru API İstek Oluşturma Hatası:', error.message);
    }
    
    console.error('Soru yükleme hatası:', error.message);
    throw error;
  }
}

module.exports = {
  getUnlimitedQuestions
}; 