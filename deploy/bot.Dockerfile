# The bot: Node runs the TypeScript itself, nothing is built. The build context is the
# repository root, as the bot shares the subtitle layout with the site in src/shared.

FROM node:26.11.1-alpine

# Alpine's ffmpeg is built with libass and comes without the X11, GL and codecs Debian's pulls
# in: the image is under a half. The font is in src/bot/fonts, the one the subtitles were tuned on
RUN apk add --no-cache ffmpeg

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data
# the site's packages are dev dependencies, so only the bot's own get here
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=error
COPY src/shared ./src/shared
COPY src/bot ./src/bot
# root, as before: the files the Bot API server hands over on the shared volume are root's
CMD ["node", "src/bot/main.ts"]
