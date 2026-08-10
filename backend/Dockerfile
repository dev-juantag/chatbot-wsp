# ─────────────────────────────────────────────
# STAGE 1: Base con dependencias de produccion
# ─────────────────────────────────────────────
FROM node:20-slim AS base

# Instalar dependencias del sistema necesarias para Prisma y pg
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar archivos de dependencias primero (cache de capas)
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma/ ./prisma/

# Instalar solo dependencias de produccion
RUN npm ci --omit=dev

# Generar el cliente de Prisma para el entorno Linux del contenedor
RUN npx prisma generate

# ─────────────────────────────────────────────
# STAGE 2: Imagen final
# ─────────────────────────────────────────────
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Crear usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Copiar desde la etapa base
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts
COPY --from=base /app/package*.json ./

# Copiar el codigo fuente
COPY src/ ./src/

# Asignar permisos al usuario no-root
RUN chown -R expressjs:nodejs /app
USER expressjs

# Puerto que expone el backend
EXPOSE 3001

# Variables de entorno requeridas (se pasan desde Coolify/docker-compose)
# DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# GEMINI_API_KEY, OPENWA_API_URL, OPENWA_API_KEY, WEBHOOK_URL,
# ENCRYPTION_KEY, JWT_SECRET, PORT

ENV PORT=3001
ENV NODE_ENV=production

# Arrancar el servidor (sin dotenvx en produccion, las vars vienen del entorno)
CMD ["node", "src/index.js"]
