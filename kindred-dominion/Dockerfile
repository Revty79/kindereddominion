ARG NODE_IMAGE=node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530
ARG WEB_IMAGE=nginx/nginx-unprivileged:1.30.8-alpine-slim@sha256:04c98c78c1de60ddeada00d7d2207dcd146ecd07b61b9941c9a5799cfb258d28
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
ARG PLAYER_CONTENT_ID=founding-kindreds-artwork-v1
ENV VITE_PLAYER_CONTENT_ID=${PLAYER_CONTENT_ID}
# Git tracking is verified in the source checkout. Archives intentionally contain no .git.
RUN node scripts/build-player.mjs --source-archive

FROM ${WEB_IMAGE} AS runtime
ARG VCS_REF=unrecorded
LABEL org.opencontainers.image.title="Kindred Dominion (working title)" \
      org.opencontainers.image.version="0.5.0" \
      org.opencontainers.image.revision="${VCS_REF}"
COPY deployment/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist-player /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
