FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# pnpm 12 will not install the tRPC "skills" approved in pnpm-workspace.yaml without a folder to put them in.
# They are for coding agents, so in an image they go to a throwaway folder. Remove this if the workspace file ever sets `skills`.
RUN printf '\nskills:\n  dirs:\n    - .agent-skills\n' >> pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile --filter @homer/web...

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @homer/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
