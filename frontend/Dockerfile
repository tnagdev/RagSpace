# Frontend Dockerfile for Audit360 Admin UI
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "serve", "--", "--host", "0.0.0.0", "--port", "3000"]
