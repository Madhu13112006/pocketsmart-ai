# Stage 1: build the React app
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: API + the built client, served from one origin
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:5000/api/health || exit 1
CMD ["node", "src/index.js"]
