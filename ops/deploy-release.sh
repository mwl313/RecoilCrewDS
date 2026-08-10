#!/usr/bin/env bash
set -euo pipefail

readonly APP_ROOT="/opt/recoilcrew"
readonly RELEASES_DIR="${APP_ROOT}/releases"
readonly CURRENT_LINK="${APP_ROOT}/current"
readonly SERVICE_NAME="recoilcrew"
readonly HEALTH_URL="http://127.0.0.1:8080/healthz"
readonly KEEP_RELEASES=5

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ $# -eq 2 ]] || fail "usage: $0 <git-sha> <release.tar.gz>"
readonly RELEASE_SHA="$1"
readonly ARCHIVE="$2"

[[ "$RELEASE_SHA" =~ ^[0-9a-fA-F]{7,64}$ ]] || fail "git SHA must contain 7-64 hexadecimal characters"
[[ -f "$ARCHIVE" ]] || fail "release archive does not exist: $ARCHIVE"
[[ "$APP_ROOT" == "/opt/recoilcrew" ]] || fail "refusing unexpected application root"
[[ -d "$RELEASES_DIR" ]] || fail "release directory is missing: $RELEASES_DIR"
[[ ! -L "$RELEASES_DIR" ]] || fail "release directory must not be a symlink"

readonly RELEASE_DIR="${RELEASES_DIR}/${RELEASE_SHA}"
readonly STAGING_DIR="${RELEASES_DIR}/.${RELEASE_SHA}.staging.$$"
readonly NEXT_LINK="${APP_ROOT}/.current.${RELEASE_SHA}.next"
previous_release=""
health_body=""

cleanup() {
  rm -f -- "$NEXT_LINK"
  if [[ -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
  [[ -z "$health_body" ]] || rm -f -- "$health_body"
}
trap cleanup EXIT

validate_archive() {
  local member
  while IFS= read -r member; do
    [[ -n "$member" ]] || continue
    [[ "$member" != /* ]] || fail "archive contains an absolute path: $member"
    [[ ! "/$member/" =~ /\.\.?/ ]] || fail "archive contains an unsafe path: $member"
  done < <(tar -tzf "$ARCHIVE")
}

restart_service() {
  sudo -n systemctl restart "$SERVICE_NAME"
}

health_matches_release() {
  local expected="$1"
  health_body="$(mktemp)"
  if ! curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" -o "$health_body"; then
    rm -f -- "$health_body"
    health_body=""
    return 1
  fi
  /usr/local/bin/node -e '
    const fs = require("node:fs");
    const [file, expected] = process.argv.slice(1);
    const health = JSON.parse(fs.readFileSync(file, "utf8"));
    if (health?.ok !== true || health?.service !== "recoil-crew" || health?.release !== expected) process.exit(1);
  ' "$health_body" "$expected"
  local result=$?
  rm -f -- "$health_body"
  health_body=""
  return "$result"
}

wait_for_health() {
  local expected="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if health_matches_release "$expected"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  log "health verification failed; rolling back"
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -s "$previous_release" "$NEXT_LINK"
    mv -Tf -- "$NEXT_LINK" "$CURRENT_LINK"
    restart_service
    local previous_sha
    previous_sha="$(basename "$previous_release")"
    if wait_for_health "$previous_sha"; then
      log "rollback to $previous_sha is healthy"
    else
      printf '[deploy] ERROR: rollback service did not become healthy\n' >&2
    fi
  else
    log "no previous release exists; removing the failed current symlink"
    [[ -L "$CURRENT_LINK" ]] && rm -f -- "$CURRENT_LINK"
  fi
  exit 1
}

prune_releases() {
  local active count=0 entry release_path resolved
  active="$(readlink -f "$CURRENT_LINK")"
  while IFS= read -r entry; do
    release_path="${entry#* }"
    [[ -n "$release_path" ]] || continue
    count=$((count + 1))
    (( count > KEEP_RELEASES )) || continue
    resolved="$(readlink -f "$release_path")"
    [[ "$resolved" != "$active" ]] || continue
    [[ "$resolved" == "$RELEASES_DIR"/* ]] || fail "refusing to prune outside releases: $resolved"
    [[ "$(basename "$resolved")" =~ ^[0-9a-fA-F]{7,64}$ ]] || fail "refusing to prune unexpected directory: $resolved"
    log "pruning old release $(basename "$resolved")"
    rm -rf -- "$resolved"
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.*.staging.*' -printf '%T@ %p\n' | sort -nr)
}

if [[ -L "$CURRENT_LINK" && "$(readlink -f "$CURRENT_LINK")" == "$RELEASE_DIR" ]]; then
  if wait_for_health "$RELEASE_SHA"; then
    log "release $RELEASE_SHA is already active and healthy"
    prune_releases
    exit 0
  fi
  fail "release $RELEASE_SHA is already active but unhealthy"
fi

validate_archive
mkdir -m 0755 -- "$STAGING_DIR"
log "extracting release $RELEASE_SHA"
tar -xzf "$ARCHIVE" --directory "$STAGING_DIR" --no-same-owner --no-same-permissions
if find "$STAGING_DIR" -type l -print -quit | grep -q .; then
  fail "release archive must not contain symbolic links"
fi

for required_dir in dist dist-server content; do
  [[ -d "$STAGING_DIR/$required_dir" ]] || fail "release is missing directory $required_dir"
done
for required_file in package.json package-lock.json; do
  [[ -f "$STAGING_DIR/$required_file" ]] || fail "release is missing file $required_file"
done
[[ -f "$STAGING_DIR/dist/index.html" ]] || fail "release is missing dist/index.html"
[[ -f "$STAGING_DIR/dist-server/index.js" ]] || fail "release is missing dist-server/index.js"

log "installing production dependencies before activation"
(
  cd "$STAGING_DIR"
  npm ci --omit=dev --no-audit --no-fund
  printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA" > .release-env
  chmod 0644 .release-env
)

if [[ -e "$RELEASE_DIR" ]]; then
  active_release="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  [[ "$active_release" != "$RELEASE_DIR" ]] || fail "release $RELEASE_SHA is already active"
  [[ "$RELEASE_DIR" == "$RELEASES_DIR"/* ]] || fail "refusing unsafe existing release path"
  rm -rf -- "$RELEASE_DIR"
fi
mv -- "$STAGING_DIR" "$RELEASE_DIR"

if [[ -L "$CURRENT_LINK" ]]; then
  previous_release="$(readlink -f "$CURRENT_LINK")"
  [[ "$previous_release" == "$RELEASES_DIR"/* ]] || fail "current points outside the releases directory"
  [[ "$(basename "$previous_release")" =~ ^[0-9a-fA-F]{7,64}$ ]] || fail "current points to an invalid release name"
elif [[ -e "$CURRENT_LINK" ]]; then
  fail "$CURRENT_LINK exists and is not a symlink"
fi

ln -s "releases/$RELEASE_SHA" "$NEXT_LINK"
mv -Tf -- "$NEXT_LINK" "$CURRENT_LINK"
log "activated release $RELEASE_SHA; restarting $SERVICE_NAME"
restart_service

if ! wait_for_health "$RELEASE_SHA"; then
  rollback
fi

log "release $RELEASE_SHA is healthy"
prune_releases
log "deployment complete"
