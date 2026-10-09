FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --cache=/tmp/npm-cache
COPY . .
USER node
EXPOSE 3100
CMD ["node", "src/server.mjs"]
