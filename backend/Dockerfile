FROM node:18-alpine
WORKDIR /usr/src/app

# Install curl for healthcheck
RUN apk add --no-cache curl

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Default command starts the API server; worker entry defined in docker-compose
CMD ["npm", "run", "start"]