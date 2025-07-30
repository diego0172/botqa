FROM node:18-alpine
WORKDIR /app

# Copia package.json y package-lock.json
COPY ./backend/package*.json ./

# Instala dependencias
RUN npm install

# Copia todo lo demás, incluyendo .env
COPY ./backend/ .

# Expone el puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "server.js"]
