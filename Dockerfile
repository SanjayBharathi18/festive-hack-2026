# syntax=docker/dockerfile:1

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# better-sqlite3 is native. Its package ships prebuilt binaries and picks the one
# for the platform at run time. --ignore-scripts skips npm's implicit node-gyp
# step, which needs Python and does nothing when a prebuilt binary fits. The last
# line loads the binary on this base, so the build fails if it does not fit.
FROM node:22-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && node -e "new (require('better-sqlite3'))(':memory:').close()"

FROM node:22-slim
ENV NODE_ENV=production \
    DATA_DIR=/data
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY fixtures ./fixtures
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
# Node runs as PID 1 and gets SIGTERM itself. npm would not pass the signal on.
CMD ["node", "server/main.ts"]
