#!/usr/bin/env bash
# Shared TCP-port helpers, SOURCED (never executed) by any scaffolded script that
# must not hard-fail on a busy port: run-dev.sh (local serve) and CI's E2E step
# (free-port allocation for the Playwright webServers). Keeping "is this port
# free / find the next free one" in ONE place means run-dev and CI can't drift.
#
#   source "$SCRIPT_DIR/port-utils.sh"
#   port_in_use 8000 && echo busy
#   PORT="$(free_port 8000)"

# port_in_use <port> -> 0 if something is LISTENING on the port, else 1.
# Prefer lsof: it sees BOTH IPv4 and IPv6 listeners. A /dev/tcp/127.0.0.1 probe
# misses IPv6-only listeners (Vite binds ::1), so it reports a busy port as free
# and the server then dies on --strictPort. Fall back to /dev/tcp where lsof is
# absent.
port_in_use() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN -n -P >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
  fi
}

# free_port <start> -> prints the first free port at/above <start> (probing up to
# 20 ports upward), or <start> itself if none is found. A caller never hard-fails
# on a busy port: it MOVES off it (a stale server, a deploy target, or another
# run already on the port) rather than colliding. Multi-tenant safe , it does not
# kill whatever holds the port.
free_port() {
  local p="$1" tries=0
  while [ "$tries" -lt 20 ]; do
    if ! port_in_use "$p"; then
      printf '%s' "$p"; return 0
    fi
    p=$((p + 1)); tries=$((tries + 1))
  done
  printf '%s' "$1"
}
