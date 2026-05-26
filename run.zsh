#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────
# Kitchen Rush — run dispatcher
# ─────────────────────────────────────────────────────────────────────────
#
#   ./run.zsh dev                     Start dev mode (two ports, hot-reload)
#   ./run.zsh prod                    Start prod mode (one port, built UI)
#   ./run.zsh build                   Build everything for prod
#   ./run.zsh update                  Rebuild + restart prod (also kicks service if installed)
#   ./run.zsh status                  Show what's running
#   ./run.zsh stop                    Stop any local dev/prod processes
#
#   ./run.zsh service install         Install LaunchAgent (auto-start at login)
#   ./run.zsh service uninstall       Remove LaunchAgent
#   ./run.zsh service start           Start the LaunchAgent now
#   ./run.zsh service stop            Stop the LaunchAgent
#   ./run.zsh service restart         Stop + start
#   ./run.zsh service status          Show LaunchAgent status
#   ./run.zsh service logs            Tail service logs
#
#   ./run.zsh help                    Print this message
#
# Defaults:
#   Dev mode  : server :4000, web :5173
#   Prod mode : single port :5050 (override with KR_PORT=NNNN)
#
# Service-mode label: com.kitchen-rush.local
# Service-mode logs : ~/Library/Logs/kitchen-rush.{out,err}.log
# ─────────────────────────────────────────────────────────────────────────

set -u

ROOT_DIR="${0:A:h}"
cd "$ROOT_DIR" || { echo "❌ Cannot cd to $ROOT_DIR"; exit 1; }

PROD_PORT="${KR_PORT:-5050}"
DEV_SERVER_PORT="${KR_DEV_SERVER_PORT:-4000}"
DEV_WEB_PORT="${KR_DEV_WEB_PORT:-5173}"

SERVICE_LABEL="com.kitchen-rush.local"
PLIST_PATH="$HOME/Library/LaunchAgents/${SERVICE_LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
OUT_LOG="${LOG_DIR}/kitchen-rush.out.log"
ERR_LOG="${LOG_DIR}/kitchen-rush.err.log"

# ─── Helpers ──────────────────────────────────────────────────────────────

c_blue()    { print -P "%F{blue}$*%f"; }
c_green()   { print -P "%F{green}$*%f"; }
c_yellow()  { print -P "%F{yellow}$*%f"; }
c_red()     { print -P "%F{red}$*%f"; }
c_dim()     { print -P "%F{8}$*%f"; }

detect_lan_ip() {
  local ip
  ip=$(ipconfig getifaddr en0 2>/dev/null) \
    || ip=$(ipconfig getifaddr en1 2>/dev/null) \
    || ip=$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -n 1 | awk '{print $2}')
  print -- "$ip"
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    c_red "❌ node not found. Install Node 20+: https://nodejs.org/"
    exit 1
  fi
  local major
  major=$(node -p "process.versions.node.split('.')[0]")
  if (( major < 20 )); then
    c_red "❌ Node 20+ required (found v${major}). Upgrade: https://nodejs.org/"
    exit 1
  fi
}

ensure_deps() {
  if [[ ! -d node_modules ]]; then
    c_yellow "📦 Installing dependencies (one-time)…"
    npm install
  fi
}

# Make sure SESSION_SIGNING_SECRET exists in .env (server refuses to start in
# prod without it). Returns the secret value.
ensure_session_secret() {
  local env_file="$ROOT_DIR/.env"
  if [[ -f "$env_file" ]] && grep -q '^SESSION_SIGNING_SECRET=' "$env_file"; then
    grep '^SESSION_SIGNING_SECRET=' "$env_file" | head -1 | cut -d= -f2-
    return
  fi
  local secret
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  print "SESSION_SIGNING_SECRET=${secret}" >> "$env_file"
  chmod 600 "$env_file"
  c_dim "🔑 Auto-generated SESSION_SIGNING_SECRET → ${env_file} (chmod 600)"
  print -- "$secret"
}

print_lan_banner() {
  local mode="$1" port="$2" ip
  ip=$(detect_lan_ip)
  print
  c_green   "════════════════════════════════════════════════"
  c_green   " ✅  Kitchen Rush is running (${mode})"
  print
  c_blue    " 🖥  This Mac : http://localhost:${port}"
  if [[ -n "$ip" ]]; then
    c_blue  " 📱 Wi-Fi    : http://${ip}:${port}"
  else
    c_yellow " 📱 Wi-Fi    : (could not detect LAN IP)"
  fi
  print
  c_dim     " Stop with: ./run.zsh stop"
  c_green   "════════════════════════════════════════════════"
  print
}

# ─── Mode: dev ────────────────────────────────────────────────────────────

cmd_dev() {
  ensure_node
  ensure_deps

  c_blue "🚀 Starting Kitchen Rush in DEV mode"
  c_dim  "    (hot-reload, two ports — server :${DEV_SERVER_PORT}, web :${DEV_WEB_PORT})"

  # Write LAN-aware Vite env so iPad can reach the API through the proxy
  mkdir -p "$ROOT_DIR/apps/web"
  cat > "$ROOT_DIR/apps/web/.env" <<EOF
# Auto-written by run.zsh — points the Vite dev server at the local API.
VITE_API_URL=http://localhost:${DEV_SERVER_PORT}
EOF

  # Start backend
  ( cd "$ROOT_DIR/apps/server" && HOST=0.0.0.0 PORT=$DEV_SERVER_PORT npm run dev ) &
  local SERVER_PID=$!

  # Start frontend (Vite — already listens on 0.0.0.0 with --host)
  ( cd "$ROOT_DIR/apps/web" && npm run dev -- --host 0.0.0.0 --port $DEV_WEB_PORT ) &
  local WEB_PID=$!

  sleep 4
  print_lan_banner "dev" "$DEV_WEB_PORT"

  c_dim "Server PID: $SERVER_PID · Web PID: $WEB_PID"
  c_dim "Tip: edit any file under apps/ and it'll hot-reload."

  trap 'kill $SERVER_PID $WEB_PID 2>/dev/null; print; c_yellow "👋 Stopped."; exit 0' INT TERM
  wait
}

# ─── Mode: build ──────────────────────────────────────────────────────────

cmd_build() {
  ensure_node
  ensure_deps
  c_blue "🔨 Building production bundle…"
  npm run build
  c_green "✅ Build complete."
  c_dim   "    apps/server/dist  (Node server)"
  c_dim   "    apps/web/dist     (static frontend)"
}

# ─── Mode: prod ───────────────────────────────────────────────────────────
# Single port. Express serves /api/* AND the built React app.

cmd_prod() {
  ensure_node
  ensure_deps

  # Build if dist is missing
  if [[ ! -d apps/web/dist ]] || [[ ! -d apps/server/dist ]]; then
    c_yellow "📦 First-time prod start — building…"
    npm run build
  fi

  local SECRET
  SECRET=$(ensure_session_secret)

  c_blue "🚀 Starting Kitchen Rush in PROD mode (single port :${PROD_PORT})"

  NODE_ENV=production HOST=0.0.0.0 PORT=$PROD_PORT \
    SESSION_SIGNING_SECRET="$SECRET" \
    node apps/server/dist/index.js &
  local PROD_PID=$!

  sleep 2
  print_lan_banner "prod" "$PROD_PORT"
  c_dim "Server PID: $PROD_PID"

  trap 'kill $PROD_PID 2>/dev/null; print; c_yellow "👋 Stopped."; exit 0' INT TERM
  wait
}

# ─── Mode: update ─────────────────────────────────────────────────────────
# Rebuild + restart prod (and the LaunchAgent if it's installed).

cmd_update() {
  c_blue "🔄 Pulling latest source + rebuilding…"

  if [[ -d .git ]]; then
    git pull --ff-only || c_yellow "⚠️  git pull failed (skipping)"
  fi

  ensure_deps
  npm install --silent
  npm run build

  if [[ -f "$PLIST_PATH" ]]; then
    c_blue "♻️  Restarting installed service…"
    cmd_service restart
  else
    c_dim "(no LaunchAgent installed — start prod manually with: ./run.zsh prod)"
  fi

  c_green "✅ Update complete."
}

# ─── Mode: status ─────────────────────────────────────────────────────────

cmd_status() {
  local found=0
  if pgrep -f "tsx watch.*kitchen-rush/apps/server" >/dev/null; then
    c_green "● dev backend running (tsx watch)"
    found=1
  fi
  if pgrep -f "vite.*kitchen-rush/apps/web" >/dev/null; then
    c_green "● dev frontend running (vite)"
    found=1
  fi
  if pgrep -f "node.*kitchen-rush/apps/server/dist" >/dev/null; then
    c_green "● prod server running"
    found=1
  fi
  if launchctl list 2>/dev/null | grep -q "$SERVICE_LABEL"; then
    c_green "● LaunchAgent installed and loaded"
    found=1
  fi
  (( found == 0 )) && c_dim "Nothing running."
}

# ─── Mode: stop ───────────────────────────────────────────────────────────

cmd_stop() {
  c_yellow "🛑 Stopping local Kitchen Rush processes…"
  pkill -f "tsx watch.*kitchen-rush/apps/server" 2>/dev/null && c_dim "  killed dev backend"
  pkill -f "vite.*kitchen-rush/apps/web"          2>/dev/null && c_dim "  killed dev frontend"
  pkill -f "node.*kitchen-rush/apps/server/dist"  2>/dev/null && c_dim "  killed prod server"
  c_green "✅ Done. (LaunchAgent left running — use 'service stop' to halt it.)"
}

# ─── Service (launchd) ────────────────────────────────────────────────────

write_plist() {
  local node_bin secret
  node_bin=$(which node)
  secret=$(ensure_session_secret)
  mkdir -p "$LOG_DIR"
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>            <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node_bin}</string>
    <string>${ROOT_DIR}/apps/server/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key> <string>${ROOT_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>                <string>production</string>
    <key>HOST</key>                    <string>0.0.0.0</string>
    <key>PORT</key>                    <string>${PROD_PORT}</string>
    <key>SESSION_SIGNING_SECRET</key>  <string>${secret}</string>
    <key>PATH</key>                    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>        <true/>
  <key>KeepAlive</key>        <true/>
  <key>StandardOutPath</key>  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key><string>${ERR_LOG}</string>
</dict>
</plist>
EOF
  chmod 600 "$PLIST_PATH"
}

cmd_service() {
  local sub="${1:-help}"
  case "$sub" in
    install)
      ensure_node
      ensure_deps

      if [[ ! -d apps/web/dist ]] || [[ ! -d apps/server/dist ]]; then
        c_yellow "📦 Building before install…"
        npm run build
      fi

      c_blue "🪛 Writing LaunchAgent → ${PLIST_PATH}"
      write_plist
      launchctl unload "$PLIST_PATH" 2>/dev/null
      launchctl load "$PLIST_PATH"
      sleep 1

      local ip
      ip=$(detect_lan_ip)
      c_green "════════════════════════════════════════════════"
      c_green "✅ Service installed and running."
      print
      c_blue "  🖥  This Mac : http://localhost:${PROD_PORT}"
      [[ -n "$ip" ]] && c_blue "  📱 Wi-Fi    : http://${ip}:${PROD_PORT}"
      print
      c_dim  "  Auto-starts at login. Logs in ${LOG_DIR}/kitchen-rush.*.log"
      c_dim  "  Stop with:    ./run.zsh service stop"
      c_dim  "  Uninstall:    ./run.zsh service uninstall"
      c_green "════════════════════════════════════════════════"
      ;;

    uninstall)
      if [[ ! -f "$PLIST_PATH" ]]; then
        c_yellow "Nothing to uninstall (no plist at ${PLIST_PATH})."
        return
      fi
      c_blue "🧹 Unloading + removing LaunchAgent…"
      launchctl unload "$PLIST_PATH" 2>/dev/null
      rm -f "$PLIST_PATH"
      c_green "✅ Uninstalled. (Built dist/ artifacts kept; remove with 'rm -rf apps/*/dist' if desired.)"
      ;;

    start)
      if [[ ! -f "$PLIST_PATH" ]]; then
        c_red "❌ Service not installed. Run: ./run.zsh service install"
        exit 1
      fi
      launchctl load "$PLIST_PATH" 2>/dev/null
      c_green "▶️  Service started."
      ;;

    stop)
      [[ -f "$PLIST_PATH" ]] && launchctl unload "$PLIST_PATH" 2>/dev/null
      c_yellow "⏸  Service stopped."
      ;;

    restart)
      cmd_service stop
      sleep 1
      cmd_service start
      ;;

    status)
      if [[ -f "$PLIST_PATH" ]]; then
        c_green "● plist installed at ${PLIST_PATH}"
      else
        c_dim "○ plist not installed"
      fi
      if launchctl list 2>/dev/null | grep -q "$SERVICE_LABEL"; then
        local line
        line=$(launchctl list 2>/dev/null | awk -v lbl="$SERVICE_LABEL" '$3==lbl')
        c_green "● loaded — ${line}"
      else
        c_dim "○ not loaded in launchctl"
      fi
      # Try the health endpoint
      if curl -sf "http://localhost:${PROD_PORT}/api/health" >/dev/null 2>&1; then
        c_green "● /api/health responding at :${PROD_PORT}"
      else
        c_dim "○ /api/health not responding (port ${PROD_PORT})"
      fi
      ;;

    logs)
      print
      c_blue "📜 ${OUT_LOG}"
      c_blue "📜 ${ERR_LOG}"
      print -- "(Ctrl+C to stop)"
      print
      tail -F "$OUT_LOG" "$ERR_LOG" 2>/dev/null
      ;;

    *)
      cmd_help
      ;;
  esac
}

# ─── Help ────────────────────────────────────────────────────────────────

cmd_help() {
  cat <<'EOF'

Kitchen Rush — run dispatcher

USAGE
  ./run.zsh <command> [subcommand]

LOCAL MODES
  dev                    Start dev mode (hot-reload, two ports)
                         Server :4000 · Web :5173
  prod                   Start prod mode (single port, built UI)
                         Default port 5050 (override: KR_PORT=8080 ./run.zsh prod)
  build                  Build prod bundles (server + web)
  update                 git pull + rebuild + restart service (if installed)
  status                 What's running locally?
  stop                   Kill any local dev/prod processes

MAC SERVICE (auto-start at login)
  service install        Install LaunchAgent that auto-starts at login
  service uninstall      Remove the LaunchAgent
  service start          Start the installed agent now
  service stop           Stop the running agent
  service restart        Stop + start
  service status         Show LaunchAgent + health-check status
  service logs           Tail the service logs

  help                   Print this message

EOF
}

# ─── Dispatch ─────────────────────────────────────────────────────────────

case "${1:-help}" in
  dev|development)     shift; cmd_dev "$@" ;;
  prod|production)     shift; cmd_prod "$@" ;;
  build)               shift; cmd_build "$@" ;;
  update|upgrade)      shift; cmd_update "$@" ;;
  status)              shift; cmd_status "$@" ;;
  stop)                shift; cmd_stop "$@" ;;
  service)             shift; cmd_service "$@" ;;
  help|-h|--help|"")   cmd_help ;;
  *)
    c_red "❌ Unknown command: $1"
    cmd_help
    exit 1
    ;;
esac
