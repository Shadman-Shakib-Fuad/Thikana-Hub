FROM node:24-bookworm-slim AS frontend
WORKDIR /project
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=5000
ENV STATIC_WEB_DIR=/app/web
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY server/scripts/admin-provision.js ./scripts/admin-provision.js
COPY server/scripts/production-dataset.js ./scripts/production-dataset.js
COPY --from=frontend /project/out /app/web
USER node
EXPOSE 5000
CMD ["node", "src/index.js"]
