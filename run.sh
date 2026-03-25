#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
#  Nadir SaaS Platform — Local Development Runner
#  Usage:
#    ./run.sh          Start both frontend + backend
#    ./run.sh frontend Start frontend only
#    ./run.sh backend  Start backend only
#    ./run.sh stop     Stop all running services
#    ./run.sh status   Check if services are running
#    ./run.sh logs     Tail backend logs
#    ./run.sh test     Run E2E health check
# ──────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/app"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_LOG="/tmp/nadir_backend.log"
FRONTEND_PORT=5173
BACKEND_PORT=8000

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[nadir]${NC} $1"; }
warn() { echo -e "${YELLOW}[nadir]${NC} $1"; }
err()  { echo -e "${RED}[nadir]${NC} $1"; }

# ── Check prerequisites ────────────────────────────────────

check_prereqs() {
    local missing=0

    if ! command -v node &>/dev/null; then
        err "Node.js not found. Install: https://nodejs.org"
        missing=1
    fi

    if ! command -v python3 &>/dev/null; then
        err "Python 3 not found."
        missing=1
    fi

    # Check .env files
    if [ ! -f "$FRONTEND_DIR/.env" ]; then
        warn "Missing app/.env — creating from template..."
        cat > "$FRONTEND_DIR/.env" << 'EOF'
VITE_SUPABASE_URL=https://cxqmqnlouozrhsprtdcb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_61_pO9Hq4wpWLerMy-5J3w_hXj3x_CM
VITE_API_URL=http://localhost:8000
EOF
        log "Created app/.env"
    fi

    if [ ! -f "$BACKEND_DIR/.env" ]; then
        warn "Missing backend/.env — creating template..."
        cat > "$BACKEND_DIR/.env" << 'EOF'
DEBUG=True
SUPABASE_URL=https://cxqmqnlouozrhsprtdcb.supabase.co
SUPABASE_SERVICE_KEY=<your-service-key>
SUPABASE_ANON_KEY=<your-anon-key>
ANTHROPIC_API_KEY=<your-anthropic-key>
COMPLEXITY_ANALYZER_TYPE=heuristic
EOF
        err "Created backend/.env — fill in your API keys!"
        missing=1
    fi

    return $missing
}

# ── Backend ─────────────────────────────────────────────────

start_backend() {
    if lsof -ti:$BACKEND_PORT &>/dev/null; then
        warn "Backend already running on port $BACKEND_PORT"
        return 0
    fi

    log "Starting backend on port $BACKEND_PORT..."

    # Create venv if missing
    if [ ! -d "$BACKEND_DIR/venv" ]; then
        log "Creating Python virtual environment..."
        python3 -m venv "$BACKEND_DIR/venv"
        source "$BACKEND_DIR/venv/bin/activate"
        pip install -r "$BACKEND_DIR/requirements.txt" -q
        log "Dependencies installed"
    fi

    cd "$BACKEND_DIR"
    source venv/bin/activate
    nohup uvicorn app.main:app --reload --port $BACKEND_PORT > "$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!

    # Wait for startup
    local retries=0
    while [ $retries -lt 30 ]; do
        if curl -s "http://localhost:$BACKEND_PORT/" &>/dev/null; then
            log "Backend running ✅  http://localhost:$BACKEND_PORT"
            log "  API docs:  http://localhost:$BACKEND_PORT/docs"
            log "  Health:    http://localhost:$BACKEND_PORT/health"
            return 0
        fi
        sleep 1
        retries=$((retries + 1))
    done

    err "Backend failed to start. Check logs: $BACKEND_LOG"
    tail -20 "$BACKEND_LOG"
    return 1
}

# ── Frontend ────────────────────────────────────────────────

start_frontend() {
    if lsof -ti:$FRONTEND_PORT &>/dev/null; then
        warn "Frontend already running on port $FRONTEND_PORT"
        return 0
    fi

    log "Starting frontend on port $FRONTEND_PORT..."

    cd "$FRONTEND_DIR"

    # Install deps if needed
    if [ ! -d "node_modules" ]; then
        log "Installing npm dependencies..."
        npm install --silent
    fi

    npx vite --port $FRONTEND_PORT &
    FRONTEND_PID=$!

    sleep 3
    log "Frontend running ✅  http://localhost:$FRONTEND_PORT"
    log "  Dashboard: http://localhost:$FRONTEND_PORT/dashboard"
    log "  Pricing:   http://localhost:$FRONTEND_PORT/pricing"
}

# ── Stop ────────────────────────────────────────────────────

stop_all() {
    log "Stopping services..."
    lsof -ti:$BACKEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null && log "Backend stopped" || true
    lsof -ti:$FRONTEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null && log "Frontend stopped" || true
    log "All services stopped"
}

# ── Status ──────────────────────────────────────────────────

check_status() {
    echo ""
    echo -e "  ${BLUE}Nadir SaaS Platform${NC}"
    echo "  ─────────────────────────────────"

    if lsof -ti:$BACKEND_PORT &>/dev/null; then
        local health=$(curl -s "http://localhost:$BACKEND_PORT/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])" 2>/dev/null || echo "unknown")
        echo -e "  Backend:  ${GREEN}running${NC} (port $BACKEND_PORT, status: $health)"
    else
        echo -e "  Backend:  ${RED}stopped${NC}"
    fi

    if lsof -ti:$FRONTEND_PORT &>/dev/null; then
        echo -e "  Frontend: ${GREEN}running${NC} (port $FRONTEND_PORT)"
    else
        echo -e "  Frontend: ${RED}stopped${NC}"
    fi

    echo ""
    echo "  URLs:"
    echo "    Homepage:  http://localhost:$FRONTEND_PORT"
    echo "    Dashboard: http://localhost:$FRONTEND_PORT/dashboard"
    echo "    API Docs:  http://localhost:$BACKEND_PORT/docs"
    echo "    Health:    http://localhost:$BACKEND_PORT/health"
    echo ""
    echo "  Login: test@getnadir.com / Test123!"
    echo ""
}

# ── Logs ────────────────────────────────────────────────────

show_logs() {
    if [ -f "$BACKEND_LOG" ]; then
        tail -f "$BACKEND_LOG"
    else
        err "No backend log found at $BACKEND_LOG"
    fi
}

# ── Test ────────────────────────────────────────────────────

run_test() {
    echo ""
    log "Running health checks..."

    # Backend
    if curl -s "http://localhost:$BACKEND_PORT/health" &>/dev/null; then
        local health=$(curl -s "http://localhost:$BACKEND_PORT/health" | python3 -m json.tool 2>/dev/null)
        echo -e "  ${GREEN}✅ Backend${NC}"
        echo "$health" | head -10 | sed 's/^/     /'
    else
        echo -e "  ${RED}❌ Backend not responding${NC}"
    fi

    # Frontend
    if curl -s "http://localhost:$FRONTEND_PORT/" &>/dev/null; then
        echo -e "  ${GREEN}✅ Frontend${NC}"
    else
        echo -e "  ${RED}❌ Frontend not responding${NC}"
    fi

    # Supabase
    local sb=$(curl -s "https://cxqmqnlouozrhsprtdcb.supabase.co/rest/v1/" -H "apikey: sb_publishable_61_pO9Hq4wpWLerMy-5J3w_hXj3x_CM" -o /dev/null -w "%{http_code}")
    if [ "$sb" = "200" ]; then
        echo -e "  ${GREEN}✅ Supabase${NC}"
    else
        echo -e "  ${RED}❌ Supabase (HTTP $sb)${NC}"
    fi

    echo ""
}

# ── Main ────────────────────────────────────────────────────

case "${1:-all}" in
    all|start)
        echo ""
        echo -e "  ${BLUE}╔═══════════════════════════════════╗${NC}"
        echo -e "  ${BLUE}║    Nadir SaaS Platform            ║${NC}"
        echo -e "  ${BLUE}║    Starting local dev server...   ║${NC}"
        echo -e "  ${BLUE}╚═══════════════════════════════════╝${NC}"
        echo ""
        check_prereqs || exit 1
        start_backend
        start_frontend
        echo ""
        log "All services running! Press Ctrl+C to stop frontend."
        log "Run './run.sh stop' in another terminal to stop everything."
        wait
        ;;
    frontend|front|fe)
        start_frontend
        wait
        ;;
    backend|back|be)
        check_prereqs || exit 1
        start_backend
        log "Backend running in background. Logs: tail -f $BACKEND_LOG"
        ;;
    stop)
        stop_all
        ;;
    status|st)
        check_status
        ;;
    logs|log)
        show_logs
        ;;
    test|check)
        run_test
        ;;
    *)
        echo "Usage: ./run.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start     Start both frontend + backend (default)"
        echo "  frontend  Start frontend only"
        echo "  backend   Start backend only"
        echo "  stop      Stop all services"
        echo "  status    Check service status"
        echo "  logs      Tail backend logs"
        echo "  test      Run health checks"
        ;;
esac
