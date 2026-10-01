FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

# better-sqlite3 can fall back to a native build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    EPUB_DATA_DIR=/data \
    ANKI_PYTHON=/opt/anki/bin/python
COPY scripts/requirements-anki.txt /tmp/requirements-anki.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg openssh-client \
    && python3 -m venv /opt/anki \
    && /opt/anki/bin/pip install --no-cache-dir -r /tmp/requirements-anki.txt \
    && rm -rf /var/lib/apt/lists/* /tmp/requirements-anki.txt
COPY --from=builder --chown=node:node /app/scripts/register_anki_card.py ./scripts/register_anki_card.py
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
