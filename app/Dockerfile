FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node public ./public
COPY --chown=node:node server.js ./server.js
USER node
EXPOSE 3000
CMD ["node", "server.js"]
