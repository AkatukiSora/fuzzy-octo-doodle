# syntax=docker/dockerfile:1
# ビルドコンテキストはリポジトリルート: docker build -f backend/Dockerfile .

FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter @app/backend...
COPY backend backend
RUN pnpm --filter @app/backend build
RUN pnpm --filter @app/backend deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY backend/fixtures ./fixtures
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
