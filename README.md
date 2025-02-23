# Parolla WebSocket Sunucusu

Parolla kelime oyunu için gerçek zamanlı WebSocket sunucusu. Bu sunucu, oyuncular arasındaki etkileşimi ve oyun mantığını yönetir.

## Özellikler

- Gerçek zamanlı soru-cevap sistemi
- Çoklu oyuncu desteği
- JWT tabanlı kimlik doğrulama
- Oyuncu can ve puan sistemi
- Otomatik soru döngüsü
- Zaman bazlı oyun mantığı

## Gereksinimler

- Node.js >= 18.0.0
- npm veya yarn
- PM2 (production için)
- Docker (opsiyonel)

## Kurulum

### Normal Kurulum

1. Repoyu klonlayın:
```bash
git clone https://github.com/radkod/parolla-ws.git
cd parolla-ws
```

2. Bağımlılıkları yükleyin:
```bash
npm install
# veya
yarn install
```

3. Örnek env dosyasını kopyalayın:
```bash
cp .env-example .env
```

4. `.env` dosyasını düzenleyin:
```env
PORT=1881
HOST=localhost
API_URL=http://parolla-backend.test/api/v1
JWT_SECRET=your_jwt_secret_key_here
```

### Docker ile Kurulum

1. Docker imajını oluşturun:
```bash
docker build -t parolla-ws .
```

2. Docker container'ı çalıştırın:
```bash
docker run -d \
  --name parolla-ws \
  -p 1881:1881 \
  -e PORT=1881 \
  -e HOST=0.0.0.0 \
  -e API_URL=http://parolla-backend.test/api/v1 \
  -e JWT_SECRET=your_jwt_secret_key_here \
  parolla-ws
```

Docker Compose ile çalıştırmak için:
```bash
docker-compose up -d
```

## Geliştirme

Geliştirme sunucusunu başlatmak için:

```bash
npm run dev
# veya
yarn dev
```

## Production

### Normal Deployment

Production ortamında çalıştırmak için:

```bash
npm start
# veya
yarn start
```

PM2 ile çalıştırmak için:

```bash
pm2 start src/server.js --name "parolla-ws"
```

### Docker Deployment

Production ortamında Docker ile çalıştırmak için:

```bash
# Docker container'ı başlat
docker start parolla-ws

# Container loglarını görüntüle
docker logs -f parolla-ws

# Container'ı durdur
docker stop parolla-ws

# Container'ı yeniden başlat
docker restart parolla-ws
```

## WebSocket Bağlantısı

WebSocket sunucusuna bağlanmak için:

```javascript
const ws = new WebSocket('ws://localhost:1881?token=your_jwt_token');
```

## WebSocket Mesaj Tipleri

### Sunucudan Gelen Mesajlar

- `CONNECTED`: Oyuncunun başarıyla bağlandığını bildirir
- `QUESTION`: Yeni soru gönderir
- `TIME_UPDATE`: Kalan süreyi bildirir
- `TIME_UP`: Sürenin dolduğunu bildirir
- `WAITING_NEXT`: Sonraki soruya geçiş süresini bildirir
- `GAME_RESTART`: Oyunun yeniden başladığını bildirir
- `ANSWER_RESULT`: Cevap sonucunu bildirir
- `GAME_OVER`: Oyuncunun oyun dışı kaldığını bildirir
- `ERROR`: Hata durumlarını bildirir

### İstemciden Gelen Mesajlar

- `ANSWER`: Oyuncunun cevabını gönderir

## Oyun Kuralları

- Her oyuncu 3 can ile başlar
- Yanlış cevaplarda can kaybedilir
- Doğru cevap 10 puan kazandırır
- Her soru için 30 saniye süre verilir
- Sorular arası 5 saniye bekleme süresi vardır

## Hata Ayıklama

### Normal Deployment

Hata loglarını görüntülemek için:

```bash
# PM2 logları
pm2 logs parolla-ws

# Uygulama logları
tail -f logs/app.log
```

### Docker Deployment

```bash
# Container logları
docker logs -f parolla-ws

# Container durumu
docker ps -a | grep parolla-ws

# Container detayları
docker inspect parolla-ws
```

## Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'feat: Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## Lisans

Bu proje [MIT lisansı](LICENSE) ile lisanslanmıştır.

## İletişim

Radkod Yazılım - info@radkod.com 