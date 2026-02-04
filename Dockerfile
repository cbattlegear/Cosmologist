# Multi-stage build for Vite React app
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json .
RUN npm ci

# Copy source
COPY . .

# Build-time version injection (optional)
ARG VITE_APP_VERSION=0.0.0
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Build static assets
RUN npm run build

# Production image
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
