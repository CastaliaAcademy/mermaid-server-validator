# syntax=docker/dockerfile:1
# Exact versions and registry digests keep base images reproducible.
FROM node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32 AS dependencies
WORKDIR /app
# npm bootstraps the pinned pnpm CLI only; project dependencies use pnpm.
RUN npm install --global pnpm@11.3.0 --ignore-scripts --no-audit --no-fund
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM oven/bun:1.4.3-slim@sha256:14a223fa35747ec728bce300ef85888bc5f7958164d15bbba6a54b22b52a3288 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bunfig.toml LICENSE ./
COPY --chown=bun:bun src ./src
USER bun
EXPOSE 3000
# No shell/pnpm wrapper: Bun receives container stop signals directly.
ENTRYPOINT ["bun"]
CMD ["src/server.js"]
