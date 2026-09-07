FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN apk add --no-cache imagemagick fontconfig ttf-dejavu \
    && npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY db ./db
COPY assets ./assets
CMD ["node", "dist/index.js"]
