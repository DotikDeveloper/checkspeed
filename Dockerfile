# Используем официальный образ Node.js 24 LTS (текущая Active LTS)
FROM node:24-alpine

# Устанавливаем рабочую директорию в контейнере
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Открываем порт, который будет использовать приложение
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"]