# Multi-stage Dockerfile for Nadir SaaS Platform
# Stage 1: Build frontend
# Stage 2: Build backend
# Stage 3: Production image (serves both)

# ── Stage 1: Frontend build ──────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY app/package*.json ./
RUN npm ci --production=false

COPY app/ ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=/api
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Backend ─────────────────────────────────────────────────
FROM python:3.12-slim AS production

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser

# Backend code
COPY backend/ ./

# Frontend static files (served by FastAPI)
COPY --from=frontend-build /app/frontend/dist /app/static

# Own app directory by appuser
RUN chown -R appuser:appuser /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run
EXPOSE 8000
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production
ENV DEBUG=False

USER appuser

CMD ["gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--timeout", "120", \
     "--access-logfile", "-"]
