#!/bin/bash

# SSL sertifikalarını yenile
certbot renew --quiet

# Yenilenen sertifikaları WebSocket sunucusu için kopyala
cp /etc/letsencrypt/live/parolla-ws.radkod.com/privkey.pem /root/parolla/parolla-ws/ssl/
cp /etc/letsencrypt/live/parolla-ws.radkod.com/fullchain.pem /root/parolla/parolla-ws/ssl/

# SSL dizininin izinlerini ayarla
chmod 755 /root/parolla/parolla-ws/ssl/
chmod 644 /root/parolla/parolla-ws/ssl/privkey.pem
chmod 644 /root/parolla/parolla-ws/ssl/fullchain.pem

# WebSocket sunucusunu yeniden başlat
cd /root/parolla/parolla-ws
pm2 restart parolla-ws

echo "SSL sertifikaları yenilendi ve WebSocket sunucusu yeniden başlatıldı." 