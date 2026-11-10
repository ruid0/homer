FROM node:24-bookworm-slim
RUN npm install -g pnpm@12.16.1
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# pnpm 12 will not install the tRPC "skills" approved in pnpm-workspace.yaml without a folder to put them in.
# They are for coding agents, so in an image they go to a throwaway folder. Remove this if the workspace file ever sets `skills`.
RUN printf '\nskills:\n  dirs:\n    - .agent-skills\n' >> pnpm-workspace.yaml
# better-sqlite3 compiles on platforms with no prebuilt binary, so the toolchain is there for the install only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && pnpm install --frozen-lockfile --filter @homer/api... \
 && apt-get purge -y python3 make g++ \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
EXPOSE 3001
WORKDIR /app/apps/api
# Node runs directly (not through pnpm) so `docker stop` reaches it and the database closes cleanly.
CMD ["node", "--import", "tsx", "src/index.ts"]
