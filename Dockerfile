# Self-hosting alternative to GitHub Pages (see docker-compose.yml). Multi-stage:
# builds the static site with Node, then serves the output with a plain nginx image.
# `.local/` (gitignored source-of-truth docs/paper) is never available here — that's
# fine, `src/contents/data/*.json` is the already-synced, committed copy the build reads.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# SITE_BASE=/ serves the site at the domain root instead of GitHub Pages' repo
# subpath — see astro.config.mjs. Override at build time (--build-arg) to instead
# serve from a subpath on the self-hosted server. SITE_ORIGIN is left unset here
# (astro.config.mjs falls back to the GitHub Pages origin) since nothing on the
# site currently reads Astro.site; override it too if that changes.
ARG SITE_BASE=/
ENV SITE_BASE=${SITE_BASE}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
