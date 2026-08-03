# Frontend image: build the Vite bundle, then serve the static output from
# nginx. The final image contains no Node runtime and no source.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build

WORKDIR /app

# npm ci needs both files and installs exactly what the lockfile pins.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked in at build time: Vite inlines VITE_* variables into the bundle, so
# these cannot be changed by the running container. Rebuild to change them.
ARG VITE_MAP_STYLE_URL=/tiles/styles/osm-bright/style.json
ENV VITE_MAP_STYLE_URL=${VITE_MAP_STYLE_URL}

RUN npm run build

# -------------------------------------------------------------- runtime
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
