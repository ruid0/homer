FROM node:24-bookworm-slim
RUN npm install -g pnpm@12.16.1
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @homer/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["pnpm", "start"]
