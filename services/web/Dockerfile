# syntax=docker/dockerfile:1

FROM node:22.16.0-bookworm-slim AS build
WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci

COPY . .
RUN npm run build

FROM nginx:1.27.5-alpine AS runtime
# Same value stamped into waymark-api; waymark-deploy fails the combine build if they differ.
ARG WAYMARK_BUILD_ID=
RUN apk add --no-cache gettext
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-waymark.sh
RUN chmod +x /docker-entrypoint-waymark.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf '%s' "${WAYMARK_BUILD_ID}" >/usr/share/nginx/html/WAYMARK_BUILD_ID
ENV API_UPSTREAM=api:8000 \
    WAYMARK_BUILD_ID=${WAYMARK_BUILD_ID}
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
ENTRYPOINT ["/docker-entrypoint-waymark.sh"]
