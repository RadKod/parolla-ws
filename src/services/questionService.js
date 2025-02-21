const axios = require('axios');
const { API_URL } = require('../config/api.config');

/**
 * API'den sınırsız mod sorularını alır
 * @returns {Promise<Array>} Sorular listesi
 */
async function getUnlimitedQuestions() {
  try {
    const response = await axios.get(`${API_URL}/modes/unlimited`);
    
    if (response.data.success && response.data.data.questions) {
      return response.data.data.questions;
    }
    
    throw new Error('Sorular alınamadı');
  } catch (error) {
    console.error('Soru yükleme hatası:', error.message);
    throw error;
  }
}

module.exports = {
  getUnlimitedQuestions
}; 