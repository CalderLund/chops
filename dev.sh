#!/bin/bash
# dev.sh - Start backend + frontend dev servers for this worktree
# Usage: ./dev.sh [port]  (or set CHOPS_PORT env var)
#        ./dev.sh stop    (stop running servers for this worktree)
#
# Each worktree gets a deterministic port based on its directory name,
# so the same worktree always lands on the same ports.
# All instances share ~/.guitar-teacher/data.db (your real practice data).

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
BASENAME="$(basename "$DIR")"

# Make locally-installed binaries (tsx, vite, etc.) available without npx
export PATH="$DIR/node_modules/.bin:$DIR/web/node_modules/.bin:$PATH"

# PID file management
PID_DIR="$HOME/.guitar-teacher"
mkdir -p "$PID_DIR"
BACKEND_PID_FILE="$PID_DIR/dev-${BASENAME}-backend.pid"
FRONTEND_PID_FILE="$PID_DIR/dev-${BASENAME}-frontend.pid"

# --- stop command ---
stop_servers() {
  local stopped=0
  for pidfile in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        echo "Stopping PID $pid ($(basename "$pidfile"))..."
        kill "$pid" 2>/dev/null
        stopped=1
      fi
      rm -f "$pidfile"
    fi
  done
  if [ "$stopped" -eq 0 ]; then
    echo "No running dev servers found for worktree '$BASENAME'."
  else
    echo "Stopped."
  fi
}

if [ "${1:-}" = "stop" ]; then
  stop_servers
  exit 0
fi

# Clean up stale PID files from crashed previous runs
for pidfile in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
  if [ -f "$pidfile" ]; then
    old_pid=$(cat "$pidfile")
    if ! kill -0 "$old_pid" 2>/dev/null; then
      rm -f "$pidfile"
    else
      echo "WARNING: Dev server for '$BASENAME' already running (PID $old_pid)."
      echo "  Run './dev.sh stop' to shut it down first."
      exit 1
    fi
  fi
done

# Port assignment: CHOPS_PORT > arg $1 > auto from dir name
if [ -n "$CHOPS_PORT" ]; then
  PORT="$CHOPS_PORT"
elif [ -n "$1" ]; then
  PORT="$1"
else
  # Deterministic port from directory name: sum of ASCII values mod 50 + 3850
  HASH=0
  for (( i=0; i<${#BASENAME}; i++ )); do
    CHAR="${BASENAME:$i:1}"
    HASH=$(( HASH + $(printf '%d' "'$CHAR") ))
  done
  PORT=$(( (HASH % 50) + 3850 ))
fi

# Check if port (or its frontend companion) is already in use; bump if so
port_in_use() {
  lsof -i :"$1" >/dev/null 2>&1
}

ATTEMPTS=0
while port_in_use "$PORT" || port_in_use "$(( PORT + 1000 ))"; do
  PORT=$(( PORT + 1 ))
  ATTEMPTS=$(( ATTEMPTS + 1 ))
  if [ "$ATTEMPTS" -ge 50 ]; then
    echo "ERROR: Could not find a free port in range $((PORT - 50))-$PORT"
    exit 1
  fi
done

VITE_PORT=$(( PORT + 1000 ))

echo "=== Guitar Teacher Dev ==="
echo "  Worktree:  $BASENAME"
echo "  Backend:   http://localhost:$PORT"
echo "  Frontend:  http://localhost:$VITE_PORT"
echo "  Stop with: ./dev.sh stop"
echo ""

# Ensure backend dependencies are installed
if [ ! -d "$DIR/node_modules" ]; then
  echo "Installing backend dependencies..."
  (cd "$DIR" && npm install)
fi

# Ensure web dependencies are installed
if [ ! -d "$DIR/web/node_modules" ]; then
  echo "Installing web dependencies..."
  (cd "$DIR/web" && npm install)
fi

# Start backend
CHOPS_PORT=$PORT tsx "$DIR/src/server.ts" &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

# Start frontend (Vite dev server proxying to the backend)
(cd "$DIR/web" && CHOPS_PORT=$PORT vite --port "$VITE_PORT") &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

# Clean shutdown on Ctrl-C
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"
}
trap cleanup EXIT INT TERM

wait
