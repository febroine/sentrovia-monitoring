FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y iputils-ping && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
