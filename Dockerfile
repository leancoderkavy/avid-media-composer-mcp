FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.source="https://github.com/leancoderkavy/avid-media-composer-mcp" \
      org.opencontainers.image.revision="${GIT_COMMIT}"

ENV NODE_ENV=production
ENV PORT=3000
ENV PATH="/opt/avid-mcp-venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install --no-install-recommends -y ffmpeg python3 python3-venv \
    && python3 -m venv /opt/avid-mcp-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY python/requirements.txt ./python/requirements.txt
RUN pip install --no-cache-dir -r python/requirements.txt
COPY python/avid_inspector.py ./python/avid_inspector.py
COPY --from=build /app/dist ./dist

RUN mkdir -p /data \
    && chown -R node:node /app /data

USER node
EXPOSE 3000
CMD ["node", "dist/http-server.js"]
