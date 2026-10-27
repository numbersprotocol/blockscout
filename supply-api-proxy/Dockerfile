FROM node:22.23.4-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
