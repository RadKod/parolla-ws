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
 * Türkçe'deki sesli-sessiz harf değişimlerini kontrol eder
 * @param {string} answer Kullanıcı cevabı
 * @param {string} correctAnswer Doğru cevap
 * @returns {boolean} Sesli-sessiz harf değişimi varsa true
 */
function checkTurkishPhonetics(answer, correctAnswer) {
  // Bazı özel durumları ele alalım
  const specialCases = {
    'canakke': ['çanakkale'],
    'çanakkale': ['canakke'],
    'duet': ['düet'],
    'düet': ['duet'],
    'besiktas': ['beşiktaş'],
    'beşiktaş': ['besiktas'],
    'istambul': ['istanbul'],
    'istanbul': ['istambul'],
    'fenerbahce': ['fenerbahçe'],
    'fenerbahçe': ['fenerbahce'],
    'galatasaray': ['galatasarey'],
    'galatasarey': ['galatasaray']
  };
  
  // Özel durum kontrolü
  const lowerAnswer = answer.toLowerCase();
  const lowerCorrect = correctAnswer.toLowerCase();
  
  // Özel durumlardan biri mi kontrol et
  if (specialCases[lowerAnswer] && specialCases[lowerAnswer].includes(lowerCorrect)) {
    return true;
  }
  
  if (specialCases[lowerCorrect] && specialCases[lowerCorrect].includes(lowerAnswer)) {
    return true;
  }
  
  // Eğer uzunlukları çok farklıysa, bu kontrol uygun değil
  if (Math.abs(answer.length - correctAnswer.length) > 3) {
    return false;
  }
  
  // Benzer harfleri değiştiren map
  const phoneticsMap = {
    'a': 'a', 'e': 'a',
    'ı': 'i', 'i': 'i', 'u': 'i', 'ü': 'i',
    'o': 'o', 'ö': 'o',
    'b': 'b', 'p': 'b',
    'c': 'c', 'ç': 'c', 'j': 'c',
    'd': 'd', 't': 'd',
    'g': 'g', 'k': 'g', 'ğ': 'g', 'y': 'g',
    's': 's', 'z': 's',
    'f': 'f', 'v': 'f',
    'm': 'm', 'n': 'm',
    'h': 'h', // h tek başına
    'l': 'l', // l tek başına
    'r': 'r'  // r tek başına
  };
  
  // Türkçe karakterlerden Latin karakterlere dönüşüm
  const turkishToLatin = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u'
  };
  
  // Türkçe karakterleri Latin karakterlere dönüştür
  const latinizedAnswer = latinize(lowerAnswer, turkishToLatin);
  const latinizedCorrect = latinize(lowerCorrect, turkishToLatin);
  
  // Eğer Türkçe karakter dönüşümü sonrası eşleşme varsa
  if (latinizedAnswer === latinizedCorrect) {
    return true;
  }
  
  // Bazı özel durum kontrolleri
  if (
    (latinizedAnswer === 'canakke' && latinizedCorrect === 'canakkale') ||
    (latinizedAnswer === 'canakkale' && latinizedCorrect === 'canakke')
  ) {
    return true;
  }
  
  // Kelimeleri fonetik olarak normalize et
  const normalizedAnswer = normalizeWithPhonetics(lowerAnswer, phoneticsMap);
  const normalizedCorrect = normalizeWithPhonetics(lowerCorrect, phoneticsMap);
  
  // Çift harfleri kontrol et (örn: canakke vs çanakkale)
  const simplifiedAnswer = simplifyDoubleLetters(normalizedAnswer);
  const simplifiedCorrect = simplifyDoubleLetters(normalizedCorrect);
  
  // Normalize edilmiş halleri karşılaştır
  if (normalizedAnswer === normalizedCorrect) {
    return true;
  }
  
  // Çift harf basitleştirilmiş halleri karşılaştır
  if (simplifiedAnswer === simplifiedCorrect) {
    return true;
  }
  
  // Türkçe karakterleri Latin karakterlere dönüştürdükten sonra
  // çift harf basitleştirilmiş halleri de kontrol et
  const simplifiedLatinAnswer = simplifyDoubleLetters(latinizedAnswer);
  const simplifiedLatinCorrect = simplifyDoubleLetters(latinizedCorrect);
  
  if (simplifiedLatinAnswer === simplifiedLatinCorrect) {
    return true;
  }
  
  // Benzerlik oranını kontrol et
  const similarity = calculateSimilarity(normalizedAnswer, normalizedCorrect);
  if (similarity > 0.9) {
    return true;
  }
  
  // Latin karakterli benzerliği de kontrol et
  const latinSimilarity = calculateSimilarity(latinizedAnswer, latinizedCorrect);
  return latinSimilarity > 0.9;
}

/**
 * Türkçe karakterleri Latin karakterlere dönüştürür
 * @private
 * @param {string} word Kelime
 * @param {Object} turkishMap Türkçe-Latin karakter haritası
 * @returns {string} Latin karakterli kelime
 */
function latinize(word, turkishMap) {
  let result = '';
  
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    result += turkishMap[char] || char;
  }
  
  return result;
}

/**
 * Çift harfleri tekil harfe indirger (çanakkale > canakale)
 * @private
 * @param {string} word Kelime
 * @returns {string} Basitleştirilmiş kelime
 */
function simplifyDoubleLetters(word) {
  // Önce kelimeyi küçük harfe çevir
  const lowerWord = word.toLowerCase();
  
  // Yaygın çift harf kalıplarını değiştir
  let simplified = lowerWord
    .replace(/kk/g, 'k')
    .replace(/ll/g, 'l')
    .replace(/mm/g, 'm')
    .replace(/nn/g, 'n')
    .replace(/ss/g, 's')
    .replace(/tt/g, 't')
    .replace(/pp/g, 'p')
    .replace(/bb/g, 'b')
    .replace(/cc/g, 'c')
    .replace(/çç/g, 'ç')
    .replace(/şş/g, 'ş')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'e')
    .replace(/ii/g, 'i')
    .replace(/ıı/g, 'ı')
    .replace(/oo/g, 'o')
    .replace(/öö/g, 'ö')
    .replace(/uu/g, 'u')
    .replace(/üü/g, 'ü');
  
  return simplified;
}

/**
 * Kelimeyi fonetik eşleştirme için normalize eder
 * @private
 * @param {string} word Kelime
 * @param {Object} phoneticsMap Fonetik dönüşüm haritası
 * @returns {string} Normalize edilmiş kelime
 */
function normalizeWithPhonetics(word, phoneticsMap) {
  let result = '';
  
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    
    // Harf için eşdeğer ses varsa onu kullan, yoksa harfi aynen kullan
    result += phoneticsMap[char] || char;
  }
  
  return result;
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
 * Turkish to english char converter
 * @param {string} value
 * @returns English variant of turkish characters
 */
const encodeEnglish = value => {
  return value
    .replace(/ /g, '-')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/Ö/g, 'o')
    .replace(/Ü/g, 'u')
    .replace(/-{2,}/g, '-')
};

/**
 * Kısa cevabın uzun cevapta içerilip içerilmediğini kontrol eder
 * @param {string} shortAnswer Kullanıcı cevabı (kısa)
 * @param {string} longAnswer Doğru cevap (uzun)
 * @returns {boolean} Kısa cevap uzun cevabın parçası mı
 */
function isPartialMatch(shortAnswer, longAnswer) {
  // Eğer kısa cevap çok kısaysa (minimum 3 karakter olmalı)
  if (shortAnswer.length < 3) {
    // Ancak tam eşleşme varsa kabul et (örneğin cevap "pas" ise)
    return shortAnswer === longAnswer;
  }
  
  // Uzun cevabı kelimelere ayır
  const longWords = longAnswer.split(/\s+/);
  
  // Kısa cevabı kelimelere ayır
  const shortWords = shortAnswer.split(/\s+/);
  
  // Eğer kısa cevap uzun cevapta kelime başlangıcı olarak içeriliyorsa
  // Ancak tam bir kelime olarak eşleşmeli
  if (longAnswer.startsWith(shortAnswer)) {
    // Kelime sınırı kontrolü (tam bir kelime olmalı veya kelimenin başlangıcı olmalı)
    const nextChar = longAnswer[shortAnswer.length];
    // Eğer sonraki karakter yoksa veya boşluksa, kelime sınırı var demektir
    if (!nextChar || nextChar === ' ') {
      return true;
    }
  }
  
  // Eğer kısa cevap tek kelimeyse ve uzun cevabın bir kelimesiyle tam eşleşiyorsa
  if (shortWords.length === 1) {
    // Uzun cevabın içinde tam kelime olarak bulunmalı (sadece parça değil)
    return longWords.some(word => word === shortWords[0]);
  }
  
  // Eğer kısa cevap birden fazla kelimeyse,
  // uzun cevabın başındaki veya sonundaki kelimelerle eşleşiyor mu kontrol et
  
  // Baştan kontrol
  const startMatches = shortWords.every((word, index) => 
    index < longWords.length && word === longWords[index]);
  
  if (startMatches) return true;
  
  // Sondan kontrol
  const endMatches = shortWords.every((word, index) => {
    const longIndex = longWords.length - shortWords.length + index;
    return longIndex >= 0 && word === longWords[longIndex];
  });
  
  return endMatches;
}

/**
 * Cevabın doğruluğunu kontrol eder
 * @param {string} answer Kullanıcı cevabı
 * @param {string} correctAnswer Doğru cevap
 * @returns {boolean} Cevap doğru mu
 */
function isAnswerCorrect(answer, correctAnswer) {
  // Türkçe karakterleri İngilizce karşılıklarına dönüştür
  const normalizedAnswer = encodeEnglish(answer);
  const normalizedCorrectAnswer = encodeEnglish(correctAnswer);
  
  // Tam eşleşme varsa
  if (answer === correctAnswer || normalizedAnswer === normalizedCorrectAnswer) return true;

  // Çekim eki farkı varsa - normalleştirilmiş cevaplar üzerinde kontrol et
  if (checkTurkishSuffixes(normalizedAnswer, normalizedCorrectAnswer)) return true;
  
  // Sesli-sessiz harf değişimi varsa - normalleştirilmiş cevaplar üzerinde kontrol et
  if (checkTurkishPhonetics(normalizedAnswer, normalizedCorrectAnswer)) return true;
  
  // Eğer kullanıcı cevabı doğru cevabın bir parçasıysa (kısa cevap uzun cevap içinde)
  // Normalleştirilmiş cevaplar üzerinde kontrol et
  if (normalizedAnswer.length < normalizedCorrectAnswer.length && isPartialMatch(normalizedAnswer, normalizedCorrectAnswer)) {
    return true;
  }
  
  // Eğer doğru cevap kullanıcı cevabının bir parçasıysa (uzun cevap kısa cevap içinde)
  // Normalleştirilmiş cevaplar üzerinde kontrol et
  if (normalizedCorrectAnswer.length < normalizedAnswer.length && isPartialMatch(normalizedCorrectAnswer, normalizedAnswer)) {
    return true;
  }

  // Benzerlik oranı çok yüksekse (0.9 = %90 benzerlik)
  // Normalleştirilmiş cevaplar üzerinde benzerlik kontrol et
  const similarity = calculateSimilarity(normalizedAnswer, normalizedCorrectAnswer);
  return similarity > 0.9;
}

module.exports = {
  isAnswerCorrect,
  checkTurkishPhonetics,
  isPartialMatch,
  encodeEnglish
}; 