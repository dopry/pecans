# build stage: install everything, compile, then strip dev dependencies
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# runtime stage: compiled dist + production dependencies only, non-root
FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/status" || exit 1

CMD ["node", "dist/index.js"]
