# The bot: Node runs the TypeScript itself, nothing is built. The build context is the
# repository root, as the bot shares the subtitle layout with the site in src/shared.

FROM node:26.11.1-slim

# Debian's ffmpeg is built with libass; Montserrat has Cyrillic, unlike the default fonts
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-montserrat \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    SUBLYA_FONTS_DIR=/usr/share/fonts/opentype/montserrat
# the site's packages are dev dependencies, so only the bot's own get here
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=error
COPY src/shared ./src/shared
COPY src/bot ./src/bot
# root, as before: the files the Bot API server hands over on the shared volume are root's
CMD ["node", "src/bot/main.ts"]
