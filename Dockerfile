FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
