# ---- Base image ----
FROM node:20-alpine

# ---- Set working directory ----
WORKDIR /app

# Needed for anchoring
RUN apk add --no-cache git

# ---- Install dependencies first (better caching) ----
COPY package.json package-lock.json* ./
RUN npm install

# ---- Copy source code ----
COPY . .

# ---- Generate Prisma client ----
RUN npx prisma generate

# ---- Build TypeScript ----
RUN npm run build

# ---- Expose port ----
EXPOSE 3000

# ---- Start server with migrations ----
# IMPORTANT:
# - `prisma migrate deploy` applies existing migrations
# - Safe for production
# - Does NOT create new migrations
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/http/server.js"]
