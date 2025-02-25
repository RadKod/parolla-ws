FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# SSL dizini oluştur
RUN mkdir -p /app/ssl

# Sertifikaları kopyala
COPY ./ssl/privkey.pem /app/ssl/
COPY ./ssl/fullchain.pem /app/ssl/

CMD ["node", "src/server.js"]
