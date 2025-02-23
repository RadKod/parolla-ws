/**
 * İki kelime arasındaki Levenshtein mesafesini hesaplar
 * @param {string} str1 Birinci kelime
 * @param {string} str2 İkinci kelime
 * @returns {number} Mesafe
 */
function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  return track[str2.length][str1.length];
}

/**
 * İki kelime arasındaki benzerlik oranını hesaplar
 * @param {string} str1 Birinci kelime
 * @param {string} str2 İkinci kelime
 * @returns {number} Benzerlik oranı (0-1 arası)
 */
function calculateSimilarity(str1, str2) {
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLength);
}

/**
 * Türkçe çekim eklerini kontrol eder
 * @param {string} answer Kullanıcı cevabı
 * @param {string} correctAnswer Doğru cevap
 * @returns {boolean} Çekim eki farkı varsa true
 */
function checkTurkishSuffixes(answer, correctAnswer) {
  // Yaygın Türkçe çekim ekleri
  const commonSuffixes = ['ler', 'lar', 'de', 'da', 'te', 'ta', 'den', 'dan', 
    'ten', 'tan', 'e', 'a', 'i', 'ı', 'u', 'ü', 'ye', 'ya', 'mek', 'mak', 
    'im', 'ım', 'um', 'üm'];

  // Cevaplardan ekleri çıkar
  let cleanAnswer = answer;
  let cleanCorrect = correctAnswer;

  for (const suffix of commonSuffixes) {
    if (answer.endsWith(suffix)) {
      cleanAnswer = answer.slice(0, -suffix.length);
    }
    if (correctAnswer.endsWith(suffix)) {
      cleanCorrect = correctAnswer.slice(0, -suffix.length);
    }
  }

  // Kökler aynı mı kontrol et
  return cleanAnswer === cleanCorrect;
}

/**
 * Cevabın doğruluğunu kontrol eder
 * @param {string} answer Kullanıcı cevabı
 * @param {string} correctAnswer Doğru cevap
 * @returns {boolean} Cevap doğru mu
 */
function isAnswerCorrect(answer, correctAnswer) {
  // Tam eşleşme varsa
  if (answer === correctAnswer) return true;

  // Çekim eki farkı varsa
  if (checkTurkishSuffixes(answer, correctAnswer)) return true;

  // Benzerlik oranı çok yüksekse (0.9 = %90 benzerlik)
  const similarity = calculateSimilarity(answer, correctAnswer);
  return similarity > 0.9;
}

module.exports = {
  isAnswerCorrect
}; 