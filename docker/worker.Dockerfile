FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/api/prisma ./apps/api/prisma
COPY apps/worker ./apps/worker

RUN npx prisma generate --schema=./apps/api/prisma/schema.prisma
RUN npm run build --workspace=@pocketlens/shared
RUN npm run build --workspace=@pocketlens/worker

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV RECEIPT_WORKER_CONCURRENCY=1

RUN apk add --no-cache openssl libc6-compat tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-vie

RUN mkdir -p /data/receipts

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/worker ./apps/worker

CMD ["node", "--max-old-space-size=3072", "./apps/worker/dist/index.js"]
