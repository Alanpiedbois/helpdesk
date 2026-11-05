# Multi-stage build: the final image has the compiled JS and production dependencies only,
# no TypeScript sources, dev tools or build cache.
FROM node:24-alpine AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl
# Dependencies first: this layer is cached as long as package*.json does not change.
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Same image for the API and the worker; docker-compose picks the command.
# The API applies pending migrations before starting (idempotent).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
