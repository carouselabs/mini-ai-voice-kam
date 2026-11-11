# Mini AI: one container runs the API and serves the built dashboard.
# Node 24 runs the server's TypeScript directly (type stripping), so only the client is compiled.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# Install with dev dependencies (needed to typecheck and build the client), then build.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --ignore-scripts

COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run build && npm prune --omit=dev --ignore-scripts

# Tracker and seller memory are written here. Mount a persistent disk at /data to keep them across restarts.
ENV MINI_AI_RUNTIME_DIR=/data/runtime
RUN mkdir -p /data/runtime && chown -R node:node /data /app
USER node

ENV PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.ts"]
