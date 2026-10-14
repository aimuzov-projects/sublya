# The build lives in the image: a new container starts only with a ready dist,
# and the old one keeps serving the site while the image builds.

FROM node:26.11.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --loglevel=error
COPY . .
# .env comes in as a build secret: the variables are needed at build time,
# but the file doesn't stay in the image layers.
RUN --mount=type=secret,id=env,target=/app/.env npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
